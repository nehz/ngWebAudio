var ngWebAudio = angular.module('ngWebAudio', [])

.factory('deferredApply', ['$timeout', function($timeout) {
  'use strict';
  return function(f, delay) {
    if (!f) return;
    $timeout(f, delay || 0);
    if ($timeout.flush) $timeout.flush();
  };
}])

.factory('WebAudio', ['deferredApply', function(deferredApply) {
  'use strict';
  var LOADING = 1;

  var AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    if (!ngWebAudio.audioContext) ngWebAudio.audioContext = new AudioContext();
    var audioCtx = ngWebAudio.audioContext;
  }
  var audioBuffers = {}, eventHandlers = {};

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

      audioCtx.decodeAudioData(req.response, function(buffer) {
        audioBuffers[src] = buffer;

        // Fire onBuffered event
        var handlers = eventHandlers[src].buffered;
        if (handlers) {
          // We can safely clean up all onBuffered event handlers, as once the
          // src media is cached, the onBuffered event can be fired immediately
          // for any new audio objects that are created henceforth
          eventHandlers[src].buffered = null;

          for (var i = 0; i < handlers.length; i++) {
            deferredApply(handlers[i]);
          }
        }
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

    if (!eventHandlers[src].buffered) eventHandlers[src].buffered = [];

    var self = {
      stopped: true,
      src: src,
      options: options,
      isWebAudio: true,

      play: function play() {
        if (!self.stopped) return;
        self.stopped = false;

        // Buffer audio if not buffered, and schedule play() for later
        if (!self.isCached()) {
          self.buffer();
          eventHandlers[src].buffered.push(function() {
            self.stopped = true;  // Need this to re-enter play()
            play(src);
          });
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
          deferredApply(self.onEnd);
        };

        if (audioSrc.start) audioSrc.start(0, playOffset);
        else if(audioSrc.noteOn) audioSrc.noteOn(0, playOffset);
        else console.error('AudioContextBuffer.start() not available');

        deferredApply(self.onPlay);
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

      buffer: function buffer() {
        if (buffer.called) return;
        buffer.called = true;

        bufferAudio(src, options.retryInterval);

        // onBuffered event
        // We need to wrap this in setTimeout() because buffer() can be
        // automatically called on creation so the user does not have an
        // opportunity to set an onBuffered event handler
        setTimeout(function() {
          if (self.isCached()) deferredApply(self.onBuffered);
          else {
            eventHandlers[src].buffered.push(function() {
              deferredApply(self.onBuffered);
            });
          }
        }, 0);
      },

      offset: function() {
        return self.stopped || !self.isCached() ?
          playOffset :
          playOffset + audioCtx.currentTime - playStartTime;
      },

      isCached: function() {
        return audioBuffers[src] && audioBuffers[src] !== LOADING;
      }
    };

    return self;
  }

  // Create HTML Audio source (fallback)
  function createHTMLAudio(src, options) {
    var audioSrc = new Audio(src);
    var loaded = false;
    var onBuffered;

    var self = {
      audioSrc: audioSrc,
      stopped: true,
      src: src,
      options: options,
      isWebAudio: false,

      play: function play() {
        if (!self.stopped) return;
        self.stopped = false;

        // Wait for audio to be buffered
        if (!loaded) {
          onBuffered = function() {
            self.stopped = true;  // Need this to re-enter play()
            play(src);
          };
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
          deferredApply(self.onEnd);
        }
      },

      pause: function() {
        self.stop(true);
      },

      buffer: function() {
        audioSrc.load();
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
        deferredApply(self.onEnd);
      }
    });
    audioSrc.addEventListener('play', function() {
      deferredApply(self.onPlay);
    });
    audioSrc.addEventListener('canplaythrough', function handler() {
      audioSrc.removeEventListener('canplaythrough', handler);
      loaded = true;
      if (onBuffered) onBuffered();
      deferredApply(self.onBuffered);
    });

    return self;
  }

  return function(src, options) {
    if (!eventHandlers[src]) eventHandlers[src] = {};

    options = options || {};
    if (options.buffer === undefined) options.buffer = true;
    if (options.loop === undefined) options.loop = false;
    if (options.gain === undefined) options.gain = 1;
    if (options.retryInterval === undefined) options.retryInterval = 1000;

    var audio = (audioCtx ? createWebAudio : createHTMLAudio)(src, options);
    if (options.buffer) audio.buffer();
    return audio;
  };
}]);
