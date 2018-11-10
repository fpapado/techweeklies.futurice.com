/* global ga */

/* Advanced Google Analytics setup, based on
 * https://philipwalton.com/articles/the-google-analytics-setup-i-use-on-every-site-i-build/
 */

/**
 * The tracking ID for your Google Analytics property.
 * https://support.google.com/analytics/answer/1032385
 */
const TRACKING_ID = process.env.GA_TRACKING_ID;

/**
 * Bump this when making backwards incompatible changes to the tracking
 * implementation. This allows you to create a segment or view filter
 * that isolates only data captured with the most recent tracking changes.
 */
const TRACKING_VERSION = "2";

/**
 * A default value for dimensions so unset values always are reported as
 * something. This is needed since Google Analytics will drop empty dimension
 * values in reports.
 */
const NULL_VALUE = "(not set)";

/**
 * A mapping between custom dimension names and their indexes.
 *
 * NOTE: Custom dimensions are based on their index in the admin console.
 * This is why we set up the mapping here.
 *
 * @see: https://support.google.com/analytics/answer/2709829
 */
const dimensions = {
  TRACKING_VERSION: "dimension1",
  CLIENT_ID: "dimension2",
  WINDOW_ID: "dimension3",
  HIT_ID: "dimension4",
  HIT_TIME: "dimension5",
  HIT_TYPE: "dimension6",
  HIT_SOURCE: "dimension7",
  VISIBILITY_STATE: "dimension8"
};

/**
 * Custom metrics that match those from the Perfume.js (and performance) timings.
 * These are reported as custom metrics instead of the timing hits, because
 * you can extract them more easily and use them in custom reports. Philip
 * Walton's article covers that for custom metrics. Perfume's default GA setup
 * uses the timing hits, so we use this one instead.
 *
 * NOTE: Custom metrics are based on their index in the admin console.
 * This is why we set up the mapping here.
 *
 * @see: https://support.google.com/analytics/answer/2709829
 */
const metrics = {
  firstPaint: "metric1",
  firstContentfulPaint: "metric2",
  firstInputDelay: "metric3"
};

/** Sends a timing metric in the shape that Perfume outputs it, to GA.
 * Uses custom metrics instead of timing hits for the reasons described
 * above.
 */
export const sendPerformanceMetric = ({ metricName, duration }) => {
  // In some edge cases browsers return very obviously incorrect NT values,
  // e.g. 0, negative, or future times. This validates values before sending.
  const allValuesAreValid = (...values) => {
    return values.every(value => value > 0 && value < 1e6);
  };

  if (
    metrics[metricName] &&
    allValuesAreValid(responseEnd, domLoaded, windowLoaded)
  ) {
    ga("send", "event", {
      eventCategory: "Performance Metrics",
      eventAction: "track",
      eventLabel: NULL_VALUE,
      nonInteraction: true,
      [metrics[metricName]]: duration
    });
  }
};

/**
 * Initializes all the analytics setup. Creates trackers and sets initial
 * values on the trackers.
 */
export const init = () => {
  // Initialize the command queue in case analytics.js hasn't loaded yet.
  window.ga = window.ga || ((...args) => (ga.q = ga.q || []).push(args));

  createTracker();
  trackErrors();
  trackCustomDimensions();
  sendInitialPageview();
};

/**
 * Tracks a JavaScript error with optional fields object overrides.
 * This function is exported so it can be used in other parts of the codebase.
 * E.g.:
 *
 *    `fetch('/api.json').catch(trackError);`
 *
 * @param {(Error|Object)=} err
 * @param {Object=} fieldsObj
 */
export const trackError = (err = {}, fieldsObj = {}) => {
  ga(
    "send",
    "event",
    Object.assign(
      {
        eventCategory: "Error",
        eventAction: err.name || "(no error name)",
        eventLabel: `${err.message}\n${err.stack || "(no stack trace)"}`,
        nonInteraction: true
      },
      fieldsObj
    )
  );
};

/**
 * Creates the trackers and sets the default transport and tracking
 * version fields. In non-production environments it also logs hits.
 */
const createTracker = () => {
  ga("create", TRACKING_ID, "auto");

  // Ensures all hits are sent via `navigator.sendBeacon()`.
  ga("set", "transport", "beacon");
};

/**
 * Tracks any errors that may have occured on the page prior to analytics being
 * initialized, then adds an event handler to track future errors.
 */
const trackErrors = () => {
  // Errors that have occurred prior to this script running are stored on
  // `window.__e.q`, as specified in `index.html`.
  const loadErrorEvents = (window.__e && window.__e.q) || [];

  const trackErrorEvent = event => {
    // Use a different eventCategory for uncaught errors.
    const fieldsObj = { eventCategory: "Uncaught Error" };

    // Some browsers don't have an error property, so we fake it.
    const err = event.error || {
      message: `${event.message} (${event.lineno}:${event.colno})`
    };

    trackError(err, fieldsObj);
  };

  // Replay any stored load error events.
  for (let event of loadErrorEvents) {
    trackErrorEvent(event);
  }

  // Add a new listener to track event immediately.
  window.addEventListener("error", trackErrorEvent);
};

/**
 * Sets a default dimension value for all custom dimensions on all trackers.
 */
const trackCustomDimensions = () => {
  // Sets a default dimension value for all custom dimensions to ensure
  // that every dimension in every hit has *some* value. This is necessary
  // because Google Analytics will drop rows with empty dimension values
  // in your reports.
  Object.keys(dimensions).forEach(key => {
    ga("set", dimensions[key], NULL_VALUE);
  });

  // Adds tracking of dimensions known at page load time.
  ga(tracker => {
    tracker.set({
      [dimensions.TRACKING_VERSION]: TRACKING_VERSION,
      [dimensions.CLIENT_ID]: tracker.get("clientId"),
      [dimensions.WINDOW_ID]: uuid()
    });
  });

  // Adds tracking to record each the type, time, uuid, and visibility state
  // of each hit immediately before it's sent.
  ga(tracker => {
    const originalBuildHitTask = tracker.get("buildHitTask");
    tracker.set("buildHitTask", model => {
      const qt = model.get("queueTime") || 0;
      model.set(dimensions.HIT_TIME, String(new Date() - qt), true);
      model.set(dimensions.HIT_ID, uuid(), true);
      model.set(dimensions.HIT_TYPE, model.get("hitType"), true);
      model.set(dimensions.VISIBILITY_STATE, document.visibilityState, true);

      originalBuildHitTask(model);
    });
  });
};

/**
 * Sends the initial pageview to Google Analytics.
 */
const sendInitialPageview = () => {
  ga("send", "pageview", { [dimensions.HIT_SOURCE]: "pageload" });
};

/**
 * Generates a UUID.
 * https://gist.github.com/jed/982883
 * @param {string|undefined=} a
 * @return {string}
 */
const uuid = function b(a) {
  return a
    ? (a ^ ((Math.random() * 16) >> (a / 4))).toString(16)
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, b);
};
