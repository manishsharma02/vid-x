/* VidX — lightweight + advanced browser proctoring for placement tests */
(function (global) {
  'use strict';

  function severityFor(type, count) {
    if (type === 'fullscreen_exit' || type === 'multiple_faces') return count > 2 ? 'high' : 'medium';
    if (type === 'tab_switch' || type === 'window_blur') return count > 5 ? 'high' : count > 2 ? 'medium' : 'low';
    return 'low';
  }

  function riskFromViolations(count, mode) {
    let score = Math.min(100, count * (mode === 'advanced' ? 8 : 5));
    if (mode === 'advanced') score += count > 3 ? 15 : 0;
    return Math.min(100, score);
  }

  function VidXProctor(options) {
    this.attemptId = options.attemptId;
    this.testId = options.testId;
    this.userId = options.userId;
    this.mode = options.mode || 'standard';
    this.requireFullscreen = !!options.requireFullscreen;
    this.onWarning = options.onWarning || function () {};
    this.violationCount = 0;
    this.events = [];
    this._bound = {};
    this._active = false;
  }

  VidXProctor.prototype.start = async function () {
    if (this._active) return;
    this._active = true;
    const self = this;

    this._bound.visibility = function () {
      if (document.hidden) self.record('tab_switch', 'Tab switch detected');
    };
    this._bound.blur = function () {
      self.record('window_blur', 'Window lost focus');
    };
    this._bound.copy = function () {
      self.record('copy_attempt', 'Copy attempt detected');
    };
    this._bound.paste = function (e) {
      self.record('paste_attempt', 'Paste attempt detected');
      if (self.mode === 'advanced') e.preventDefault();
    };
    this._bound.fullscreen = function () {
      if (self.requireFullscreen && !document.fullscreenElement) {
        self.record('fullscreen_exit', 'Left fullscreen mode');
      }
    };

    document.addEventListener('visibilitychange', this._bound.visibility);
    window.addEventListener('blur', this._bound.blur);
    document.addEventListener('copy', this._bound.copy);
    document.addEventListener('paste', this._bound.paste);
    document.addEventListener('fullscreenchange', this._bound.fullscreen);

    if (this.requireFullscreen && !document.fullscreenElement) {
      try { await document.documentElement.requestFullscreen(); } catch (e) { /* user may deny */ }
    }
  };

  VidXProctor.prototype.record = async function (type, message) {
    this.violationCount += 1;
    const severity = severityFor(type, this.violationCount);
    const payload = {
      attempt_id: this.attemptId,
      user_id: this.userId,
      test_id: this.testId,
      event_type: type,
      severity,
      details: { message, count: this.violationCount }
    };
    this.events.push(payload);
    if (typeof logProctorEvent === 'function') await logProctorEvent(payload);
    this.onWarning(message, this.violationCount, riskFromViolations(this.violationCount, this.mode));
  };

  VidXProctor.prototype.stop = function () {
    this._active = false;
    document.removeEventListener('visibilitychange', this._bound.visibility);
    window.removeEventListener('blur', this._bound.blur);
    document.removeEventListener('copy', this._bound.copy);
    document.removeEventListener('paste', this._bound.paste);
    document.removeEventListener('fullscreenchange', this._bound.fullscreen);
  };

  VidXProctor.prototype.summary = function () {
    return {
      violationCount: this.violationCount,
      riskScore: riskFromViolations(this.violationCount, this.mode),
      events: this.events
    };
  };

  global.VidXProctor = VidXProctor;
})(window);
