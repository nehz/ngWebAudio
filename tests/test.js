jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

function ngWebAudioTest(fallback) {
  var WebAudio, wa;

  beforeAll(function() {
    if (fallback) {
      window.AudioContext = null;
      window.webkitAudioContext = null;
    }
  });

  beforeEach(module('ngWebAudio'));
  beforeEach(inject(function(_WebAudio_) {
    WebAudio = _WebAudio_;
    wa = WebAudio('base/tests/test.mp3');
  }));

  it('test mode', function() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (fallback) expect(wa.audioSrc).toBeDefined();
    else if (AudioContext) expect(wa.audioSrc).toBeUndefined();
  });

  it('should play audio', function(done) {
    wa.play();

    wa.onPlay = function() {
      setTimeout(function() {
        expect(wa.offset()).toBeGreaterThan(0);
        expect(wa.stopped).toBe(false);
      }, 2000);
    };

    wa.onEnd = function() {
      expect(wa.offset()).toBe(0);
      expect(wa.stopped).toBe(true);

      setTimeout(function() {
        expect(wa.offset()).toBe(0);
        expect(wa.stopped).toBe(true);
        done();
      }, 500);
    };
  });

  it('should loop audio', function(done) {
    wa.options.loop = true;
    wa.play();

    wa.onPlay = function() {
      setTimeout(function() {
        expect(wa.onEnd).not.toHaveBeenCalled();
        wa.stop();
        expect(wa.onEnd).toHaveBeenCalled();
        done();
      }, 8000);
    };

    wa.onEnd = function() {};
    spyOn(wa, 'onEnd');
  });

  it('should stop audio', function(done) {
    wa.play();

    wa.onPlay = function() {
      setTimeout(function() {
        expect(wa.onEnd).not.toHaveBeenCalled();
        expect(wa.offset()).toBeGreaterThan(0);
        expect(wa.stopped).toBe(false);
        wa.stop();
        expect(wa.offset()).toBe(0);
        expect(wa.stopped).toBe(true);
      }, 1000);
    };

    wa.onEnd = function () {
      setTimeout(function() {
        done();
      }, 100);
    };

    spyOn(wa, 'onEnd').and.callThrough();
  });

  it('should pause audio', function(done) {
    wa.play();

    wa.onPlay = function() {
      var offset1, offset2;
      wa.onPlay = null;

      setTimeout(function () {
        wa.pause();
        setTimeout(function() { offset1 = wa.offset(); }, 0);
      }, 1000);

      setTimeout(function () {
        expect(wa.offset()).toBeCloseTo(offset1, 10);
        wa.play();
      }, 2000);

      setTimeout(function () {
        wa.pause();
        setTimeout(function() { offset2 = wa.offset(); }, 0);
      }, 3000);

      setTimeout(function () {
        expect(wa.offset()).toBeCloseTo(offset2, 10);
        expect(offset1).toBeLessThan(offset2);
        wa.play();
      }, 4000);
    };

    wa.onEnd = function() {
      setTimeout(function() {
        done();
      }, 100);
    };
  });

  it('offset should be increasing', function(done) {
    var lastOffset = 0;
    wa.play();
    expect(wa.offset()).toBe(0);

    wa.onPlay = function() {
      function check() {
        var offset;
        expect(offset = wa.offset()).toBeGreaterThan(lastOffset);
        lastOffset = offset;
      }
      for (var i = 1; i < 10; i++) {
        setTimeout(check, 100 * i);
      }
    };

    wa.onEnd = function() {
      setTimeout(function() {
        done();
      }, 100);
      done();
    };
  });

  it('should cache', function(done) {
    // Caching is not handled by us in fallback (HTML Audio)
    if (!wa.isWebAudio) {
      done();
      return;
    }

    expect(wa.isCached).not.toBeUndefined();
    expect(wa.isCached()).toBe(false);

    wa.onBuffered = function() {
      var wa_cached = WebAudio(wa.src);

      expect(wa.isCached()).toBe(true);
      expect(wa_cached.isCached()).toBe(true);

      wa_cached.onBuffered = function() {
        expect(wa.isCached()).toBe(true);
        expect(wa_cached.isCached()).toBe(true);
        done();
      };
    };
  });

  describe('onBuffered event', function() {
    it('should fire if not buffered', function(done) {
      wa.onBuffered = function() { done(); };
    });

    it('should fire if already buffered', function(done) {
      wa.onBuffered = function() {
        var wa_cached = WebAudio(wa.src);
        wa_cached.onBuffered = function() { done(); };
      };
    });

    it('should only fire once', function(done) {
      var fired = false;
      wa.buffer();
      wa.onBuffered = function() {
        expect(fired).toBe(false);
        fired = true;
        setTimeout(function() { done(); }, 1000);
      };
    });
  });
}

describe('ngWebAudio', ngWebAudioTest);
describe('ngWebAudioFallback', function() {
  ngWebAudioTest(true);
});
