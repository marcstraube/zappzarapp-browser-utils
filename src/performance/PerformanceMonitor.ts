/**
 * Performance Monitor - Performance API wrapper with Core Web Vitals support.
 *
 * Features:
 * - Core Web Vitals metrics (FCP, LCP, FID, CLS, INP, TTFB)
 * - Performance marks and measures
 * - PerformanceObserver-based metric collection
 * - Instance-based API for isolated monitoring contexts
 * - Graceful fallback when API not supported
 *
 * @example
 * ```TypeScript
 * // Create a performance monitor instance
 * const monitor = PerformanceMonitor.create();
 *
 * if (monitor.isSupported()) {
 *   // Create performance marks
 *   monitor.mark('task-start');
 *   // ... do work ...
 *   monitor.mark('task-end');
 *
 *   // Measure duration
 *   const measure = monitor.measure('task-duration', 'task-start', 'task-end');
 *   console.log(`Task took ${measure?.duration}ms`);
 *
 *   // Get Core Web Vitals
 *   const metrics = monitor.getMetrics();
 *   console.log('FCP:', metrics.fcp);
 *
 *   // Listen for metric updates (including INP)
 *   const cleanup = monitor.onMetric('inp', (value) => {
 *     console.log('INP:', value);
 *   });
 * }
 * ```
 */
import type { CleanupFn } from '../core/index.js';

/**
 * Core Web Vitals and performance metrics.
 */
export interface PerformanceMetrics {
  /** First Contentful Paint (ms) */
  readonly fcp?: number;
  /** Largest Contentful Paint (ms) */
  readonly lcp?: number;
  /** First Input Delay (ms) - deprecated in favor of INP */
  readonly fid?: number;
  /** Cumulative Layout Shift (unitless) */
  readonly cls?: number;
  /** Interaction to Next Paint (ms) */
  readonly inp?: number;
  /** Time to First Byte (ms) */
  readonly ttfb?: number;
}

/**
 * Metric types that can be observed.
 */
export type MetricType = 'fcp' | 'lcp' | 'fid' | 'cls' | 'inp';

/**
 * Handler function for metric updates.
 */
export type MetricHandler = (value: number) => void;

/**
 * Performance monitor instance with isolated state.
 */
export interface PerformanceMonitorInstance {
  /** Check if Performance API is supported. */
  isSupported(): boolean;
  /** Create a performance mark. */
  mark(name: string): void;
  /** Create a performance measure between two marks. */
  measure(name: string, startMark?: string, endMark?: string): PerformanceMeasure | undefined;
  /** Get current Core Web Vitals metrics. */
  getMetrics(): PerformanceMetrics;
  /** Get performance entries by type. */
  getEntries(type?: string): PerformanceEntryList;
  /** Subscribe to metric updates. */
  onMetric(type: MetricType, handler: MetricHandler): CleanupFn;
  /** Clear all performance marks. */
  clearMarks(name?: string): void;
  /** Clear all performance measures. */
  clearMeasures(name?: string): void;
  /** Get Time to First Byte from navigation timing. @internal */
  getTTFB(): number | undefined;
  /** Get First Contentful Paint from paint entries. @internal */
  getFCP(): number | undefined;
  /** Reset collected metrics (useful for testing). @internal */
  _reset(): void;
}

/**
 * Get the entry type for a metric.
 */
function getEntryTypeForMetric(metric: MetricType): string {
  switch (metric) {
    case 'fcp':
      return 'paint';
    case 'lcp':
      return 'largest-contentful-paint';
    case 'fid':
      return 'first-input';
    case 'cls':
      return 'layout-shift';
    case 'inp':
      return 'event';
  }
}

/**
 * Extract metric value from performance entry.
 */
function extractMetricValue(metric: MetricType, entry: PerformanceEntry): number | undefined {
  switch (metric) {
    case 'fcp':
      if (entry.name === 'first-contentful-paint') {
        return entry.startTime;
      }
      return undefined;
    case 'lcp':
      return entry.startTime;
    case 'fid':
      if ('processingStart' in entry && typeof entry.processingStart === 'number') {
        return entry.processingStart - entry.startTime;
      }
      return undefined;
    case 'cls':
      if ('hadRecentInput' in entry && entry.hadRecentInput === false && 'value' in entry) {
        return entry.value as number;
      }
      return undefined;
    case 'inp':
      if ('duration' in entry && typeof entry.duration === 'number' && entry.duration > 0) {
        return entry.duration;
      }
      return undefined;
  }
}

/**
 * Check if PerformanceObserver supports a specific entry type.
 * Note: This function assumes PerformanceObserver is defined (checked by caller).
 */
function supportsEntryType(entryType: string): boolean {
  try {
    const supportedTypes = PerformanceObserver.supportedEntryTypes;
    return Array.isArray(supportedTypes) && supportedTypes.includes(entryType);
  } catch {
    return false;
  }
}

export const PerformanceMonitor = {
  /**
   * Check if Performance API is supported.
   */
  isSupported(): boolean {
    return typeof performance !== 'undefined' && typeof performance.mark === 'function';
  },

  /**
   * Create a new performance monitor instance with isolated state.
   *
   * @example
   * ```TypeScript
   * const monitor = PerformanceMonitor.create();
   * monitor.mark('start');
   * ```
   */
  create(): PerformanceMonitorInstance {
    // Instance state - isolated per create() call
    let collectedMetrics: PerformanceMetrics = {};
    const activeObservers = new Map<MetricType, PerformanceObserver>();
    const metricHandlers = new Map<MetricType, Set<MetricHandler>>();

    /**
     * Update the collected metrics with a new value.
     */
    function updateCollectedMetrics(metric: MetricType, value: number): void {
      if (metric === 'cls') {
        const currentCls = collectedMetrics.cls ?? 0;
        collectedMetrics = { ...collectedMetrics, cls: currentCls + value };
      } else if (metric === 'inp') {
        // INP tracks the worst (highest) interaction latency
        const currentInp = collectedMetrics.inp ?? 0;
        if (value > currentInp) {
          collectedMetrics = { ...collectedMetrics, inp: value };
        }
      } else {
        collectedMetrics = { ...collectedMetrics, [metric]: value };
      }
    }

    /**
     * Notify all handlers for a metric with the current value.
     */
    function notifyHandlers(metric: MetricType, value: number): void {
      const handlers = metricHandlers.get(metric);
      if (!handlers) {
        return;
      }
      const finalValue =
        metric === 'cls'
          ? (collectedMetrics.cls ?? value)
          : metric === 'inp'
            ? (collectedMetrics.inp ?? value)
            : value;
      for (const handler of handlers) {
        handler(finalValue);
      }
    }

    /**
     * Process a performance entry for a specific metric.
     */
    function processEntry(metric: MetricType, entry: PerformanceEntry): void {
      const value = extractMetricValue(metric, entry);
      if (value === undefined) {
        return;
      }
      updateCollectedMetrics(metric, value);
      notifyHandlers(metric, value);
    }

    /**
     * Create observer for a specific metric type.
     */
    function createObserverForMetric(metric: MetricType): PerformanceObserver | undefined {
      const entryType = getEntryTypeForMetric(metric);

      if (!supportsEntryType(entryType)) {
        return undefined;
      }

      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            processEntry(metric, entry);
          }
        });

        const observeOptions: PerformanceObserverInit = { type: entryType, buffered: true };
        // INP needs durationThreshold to capture interactions
        if (metric === 'inp') {
          (
            observeOptions as PerformanceObserverInit & { durationThreshold: number }
          ).durationThreshold = 16;
        }

        observer.observe(observeOptions);
        return observer;
      } catch {
        return undefined;
      }
    }

    const instance: PerformanceMonitorInstance = {
      isSupported(): boolean {
        return PerformanceMonitor.isSupported();
      },

      mark(name: string): void {
        if (!instance.isSupported()) {
          return;
        }
        performance.mark(name);
      },

      measure(name: string, startMark?: string, endMark?: string): PerformanceMeasure | undefined {
        if (!instance.isSupported()) {
          return undefined;
        }

        try {
          return performance.measure(name, startMark, endMark);
        } catch {
          return undefined;
        }
      },

      getMetrics(): PerformanceMetrics {
        if (!instance.isSupported()) {
          return {};
        }

        // Collect TTFB if not already collected
        if (collectedMetrics.ttfb === undefined) {
          const ttfb = instance.getTTFB();
          if (ttfb !== undefined) {
            collectedMetrics = { ...collectedMetrics, ttfb };
          }
        }

        // Try to get FCP from paint entries if not collected via observer
        if (collectedMetrics.fcp === undefined) {
          const fcp = instance.getFCP();
          if (fcp !== undefined) {
            collectedMetrics = { ...collectedMetrics, fcp };
          }
        }

        return { ...collectedMetrics };
      },

      getEntries(type?: string): PerformanceEntryList {
        if (!instance.isSupported()) {
          return [];
        }

        if (type !== undefined) {
          return performance.getEntriesByType(type);
        }

        return performance.getEntries();
      },

      onMetric(type: MetricType, handler: MetricHandler): CleanupFn {
        if (typeof PerformanceObserver === 'undefined') {
          return () => {};
        }

        // Get or create handler set
        let handlers = metricHandlers.get(type);
        if (!handlers) {
          handlers = new Set();
          metricHandlers.set(type, handlers);
        }
        handlers.add(handler);

        // Create observer if not exists
        if (!activeObservers.has(type)) {
          const observer = createObserverForMetric(type);
          if (observer) {
            activeObservers.set(type, observer);
          }
        }

        // If we already have a value for this metric, call handler immediately
        const currentValue = collectedMetrics[type];
        if (currentValue !== undefined) {
          handler(currentValue);
        }

        return () => {
          const handlersSet = metricHandlers.get(type);
          if (handlersSet) {
            handlersSet.delete(handler);

            // If no more handlers, disconnect observer
            if (handlersSet.size === 0) {
              const observer = activeObservers.get(type);
              if (observer) {
                observer.disconnect();
                activeObservers.delete(type);
              }
              metricHandlers.delete(type);
            }
          }
        };
      },

      clearMarks(name?: string): void {
        if (!instance.isSupported()) {
          return;
        }

        if (name !== undefined) {
          performance.clearMarks(name);
        } else {
          performance.clearMarks();
        }
      },

      clearMeasures(name?: string): void {
        if (!instance.isSupported()) {
          return;
        }

        if (name !== undefined) {
          performance.clearMeasures(name);
        } else {
          performance.clearMeasures();
        }
      },

      getTTFB(): number | undefined {
        if (!instance.isSupported()) {
          return undefined;
        }

        const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        if (entries.length > 0) {
          const nav = entries[0];
          if (nav && nav.responseStart > 0) {
            return nav.responseStart;
          }
        }

        return undefined;
      },

      getFCP(): number | undefined {
        if (!instance.isSupported()) {
          return undefined;
        }

        const entries = performance.getEntriesByType('paint');
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') {
            return entry.startTime;
          }
        }

        return undefined;
      },

      _reset(): void {
        collectedMetrics = {};

        // Disconnect all observers
        for (const observer of activeObservers.values()) {
          observer.disconnect();
        }
        activeObservers.clear();
        metricHandlers.clear();
      },
    };

    return instance;
  },
};
