angular.module('ngWebAudio', [])

.factory('WebAudio', function() {
  var LOADING = 1;

  if (!window.AudioContext) window.AudioContext = window.webkitAudioContext;
  var audioCtx = window.AudioContext ? new window.AudioContext() : null,
    audioBuffers = {};

  // Buffer audio via XHR
  function bufferAudio(src, retryInterval) {
    if (audioBuffers[src]) return;
    retryInterval = retryInterval || 1000;
    audioBuffers[src] = LOADING;

    var req = new XMLHttpRequest();
    req.open('GET', src, true);
    req.responseType = 'arraybuffer';

    req.onload = function() {
      if (req.status !== 200 && audioBuffers[src]) return req.onerror();

      // If we're using HTML fallback, we're hoping that our XHR will cause the
      // browser to cache the content
      if (!audioCtx) return;

      audioCtx.decodeAudioData(req.response, function(buffer) {
        audioBuffers[src] = buffer;
      });
    };

    // Keep retrying until XHR succeeds
    req.onerror = function() {
      console.error('Retrying ', src);
      audioBuffers[src] = null;
      setTimeout(function() { bufferAudio(src, retryInterval); }, retryInterval);
    };

    req.send();
  }

  // Create WebAudio source
  function createWebAudio(src, options) {
    var playStartTime = 0;  // Used to keep track how long clip is played for
    var playOffset = 0;  // Used to keep track of how far into clip we are

    var self = {
      stopped: true,
      options: options,
      play: function play() {
        if (!self.stopped) return;
        self.stopped = false;

        // Buffer audio if not buffered, and schedule play() for later
        if (!audioBuffers[src] || audioBuffers[src] === LOADING) {
          bufferAudio(src, options.retryInterval);
          (function retry() {
            if (audioBuffers[src] && audioBuffers[src] !== LOADING && !self.stopped) {
              self.stopped = true;
              play(src);
            }
            else setTimeout(retry, 200);
          })();
          return;
        }

        var audioSrc = self.audioSrc = audioCtx.createBufferSource();
        var gainNode = audioCtx.createGain();
        gainNode.gain.value = options.gain;

        audioSrc.buffer = audioBuffers[src];
        audioSrc.connect(audioCtx.destination);
        audioSrc.loop = !!options.loop;
        audioSrc.onended = function() {
          self.stopped = true;
          if (self.onEnd) self.onEnd();
        };

        if (audioSrc.start) audioSrc.start(0, playOffset);
        else if(audioSrc.noteOn) audioSrc.noteOn(0, playOffset);
        else console.error('AudioContextBuffer.start() not available');

        if (self.onPlay) self.onPlay();
        playStartTime = audioCtx.currentTime;
      },

      stop: function(pause) {
        if (self.stopped) return;
        self.stopped = true;

        if (!pause) playOffset = 0;
        else playOffset += audioCtx.currentTime - playStartTime;

        if (!pause && self.audioSrc.onended) self.audioSrc.onended();
        self.audioSrc.onended = null;

        if (self.audioSrc.stop) self.audioSrc.stop(0);
        else if(self.audioSrc.noteOff) self.audioSrc.noteOff(0);
        else console.error('AudioContextBuffer.stop() not available');
      },

      pause: function() {
        self.stop(true);
      },

      buffer: function() {
        bufferAudio(src, options.retryInterval);
      },

      offset: function() {
        return self.stopped ?
          playOffset :
          playOffset + audioCtx.currentTime - playStartTime;
      }
    };

    return self;
  }

  // Create HTML Audio source (fallback)
  function createHTMLAudio(src, options) {
    var audioSrc = new Audio(src);

    var self = {
      audioSrc: audioSrc,
      stopped: true,
      options: options,
      loaded: false,
      play: function play() {
        if (!self.stopped) return;
        self.stopped = false;

        // Wait for audio to be buffered
        if (!self.loaded) {
          (function retry() {
            if (self.loaded && !self.stopped) {
              self.stopped = true;
              play(src);
            }
            else setTimeout(retry, 200);
          })();
          return;
        }

        audioSrc.volume = options.gain;
        audioSrc.loop = !!options.loop;
        audioSrc.play();
      },

      stop: function(pause) {
        if (self.stopped) return;
        self.stopped = true;

        audioSrc.pause();
        if (!pause) {
          audioSrc.currentTime = 0;
          if (self.onEnd) self.onEnd();
        }
      },

      pause: function() {
        self.stop(true);
      },

      buffer: function() {
        bufferAudio(src, options.retryInterval);
      },

      offset: function() {
        return audioSrc.duration && audioSrc.currentTime <= audioSrc.duration ?
          audioSrc.currentTime : 0;
      }
    };

    audioSrc.addEventListener('ended', function() {
      self.stopped = true;
      self.audioSrc.currentTime = 0;
      if (!options.loop) {
        audioSrc.pause();
        if (self.onEnd) self.onEnd();
      }
    });
    audioSrc.addEventListener('play', function() {
      if (self.onPlay) self.onPlay();
    });
    audioSrc.addEventListener('loadeddata', function() {
      self.loaded = true;
    });

    return self;
  }

  return function(src, options) {
    options = options || {};
    if (options.gain === undefined) options.gain = 1;

    if (!audioBuffers[src] && options.buffer !== false) {
      bufferAudio(src, options.retryInterval);
    }
    if (audioCtx) return createWebAudio(src, options);
    else return createHTMLAudio(src, options);
  };
});
