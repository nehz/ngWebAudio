var ngWebAudio = angular.module('ngWebAudio', [])

.factory('deferredApply', ['$timeout', function($timeout) {
  'use strict';
  return function(f, delay) {
    if (!f) return;
    $timeout(f, delay || 0);
    if ($timeout.flush) $timeout.flush();
  };
}])

.factory('WebAudio', ['$rootScope', 'deferredApply', function($rootScope, deferredApply) {
  'use strict';
  var LOADING = 1;

  var AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    if (!ngWebAudio.audioContext) {
      // iOS sample rate fix
      // Based on: https://github.com/Jam3/ios-safe-audio-context
      var dummyCtx = new AudioContext();
      var dummyBuffer = dummyCtx.createBuffer(1, 1, 44100);
      var dummySrc = dummyCtx.createBufferSource();
      dummySrc.buffer = dummyBuffer;
      dummySrc.connect(dummyCtx.destination);
      if (dummySrc.start) dummySrc.start(0);
      else if(dummySrc.noteOn) dummySrc.noteOn(0);
      else console.error('AudioContextBuffer.start() not available');
      dummySrc.disconnect();
      if (dummyCtx.close) dummyCtx.close();

      ngWebAudio.audioContext = new AudioContext();
    }
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
  function createWebAudio(self, src, options) {
    var playStartTime = 0;  // Used to keep track how long clip is played for
    var playOffset = 0;  // Used to keep track of how far into clip we are
    var duration = Infinity;  // Moddulo duration for when playback loops

    if (!eventHandlers[src].buffered) eventHandlers[src].buffered = [];

    self.stopped = true;
    self.src = src;
    self.options = options;
    self.isWebAudio = true;

    self.play = function play() {
      if (!self.stopped) return;
      self.stopped = false;

      // Create buffer early or iOS will mute audio (requires ui event trigger)
      if (!self.audioSrc || self.audioSrc.buffer) {
        self.audioSrc = audioCtx.createBufferSource();
        self.gainNode = audioCtx.createGain();
        self.gainNode.gain.value = 0;
        self.audioSrc.connect(self.gainNode);
        self.gainNode.connect(audioCtx.destination);
      }

      // Buffer audio if not buffered, and schedule play() for later
      if (!self.isCached()) {
        self.buffer();
        eventHandlers[src].buffered.push(function() {
          self.stopped = true;  // Need this to re-enter play()
          play(src);
        });
        return;
      }

      self.gainNode.gain.value = options.gain;
      self.audioSrc.buffer = audioBuffers[src];
      self.audioSrc.loop = !!options.loop;
      self.audioSrc.onended = function() {
        self.stopped = true;
        playOffset = 0;
        deferredApply(self.onEnd);
        $rootScope.$apply();
      };

      if (self.audioSrc.start) self.audioSrc.start(0, playOffset);
      else if(self.audioSrc.noteOn) self.audioSrc.noteOn(0, playOffset);
      else console.error('AudioContextBuffer.start() not available');

      deferredApply(self.onPlay);
      playStartTime = audioCtx.currentTime;
      duration = self.audioSrc.buffer.duration;
    };

    self.stop = function stop(pause) {
      if (!self.audioSrc) return;
      if (pause) {
        if(!self.stopped) {
          playOffset += audioCtx.currentTime - playStartTime;
          playOffset %= duration;
        }
      }
      else {
        playOffset = 0;
        deferredApply(self.onStop);
      }
      if (!self.stopped && self.audioSrc.onended) {
        if (self.audioSrc.stop) self.audioSrc.stop(0);
        else if(self.audioSrc.noteOff) self.audioSrc.noteOff(0);
        else console.error('AudioContextBuffer.stop() not available');
      }
      self.audioSrc.onended = null;
      self.stopped = true;
    };

    self.pause = function pause() {
      self.stop(true);
    };

    self.buffer = function buffer() {
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
    };

    self.offset = function offset() {
      return self.stopped || !self.isCached() ?
        playOffset :
        (playOffset + audioCtx.currentTime - playStartTime) % duration;
    };

    self.isCached = function isCached() {
      return audioBuffers[src] && audioBuffers[src] !== LOADING;
    };

    return self;
  }

  // Create HTML Audio source (fallback)
  function createHTMLAudio(self, src, options) {
    var audioSrc = new Audio(src);
    var loaded = false;
    var onBuffered;

    self.audioSrc = audioSrc;
    self.stopped = true;
    self.src = src;
    self.options = options;
    self.isWebAudio = false;

    self.play = function play() {
      if (!self.stopped) return;
      self.stopped = false;

      // Wait for audio to be buffered
      if (!loaded) {
        onBuffered = function() {
          self.stopped = true;  // Need this to re-enter play()
          play(src);
        };
        self.buffer();
        return;
      }

      audioSrc.volume = options.gain;
      audioSrc.loop = !!options.loop;
      audioSrc.play();
    };

    self.stop = function stop(pause) {
      if (!loaded) return;
      self.stopped = true;
      audioSrc.pause();
      if (!pause) {
        audioSrc.currentTime = 0;
        deferredApply(self.onStop);
      }
    };

    self.pause = function pause() {
      self.stop(true);
    };

    self.buffer = function buffer() {
      audioSrc.load();
    };

    self.offset = function offset() {
      return audioSrc.duration && audioSrc.currentTime <= audioSrc.duration ?
        audioSrc.currentTime : 0;
    };

    audioSrc.addEventListener('ended', function() {
      self.stopped = true;
      self.audioSrc.currentTime = 0;
      if (!options.loop) {
        audioSrc.pause();
        deferredApply(self.onEnd);
      }
      $rootScope.$apply();
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

  var WebAudio = function WebAudio(src, options) {
    if (!(this instanceof WebAudio)) return new WebAudio(src, options);
    if (!eventHandlers[src]) eventHandlers[src] = {};

    options = options || {};
    if (options.buffer === undefined) options.buffer = true;
    if (options.loop === undefined) options.loop = false;
    if (options.gain === undefined) options.gain = 1;
    if (options.retryInterval === undefined) options.retryInterval = 1000;

    var ctor = audioCtx && !options.fallback ? createWebAudio : createHTMLAudio;
    ctor(this, src, options);
    if (options.buffer) this.buffer();
  };

  WebAudio.setContext = function(newCtx) {
    audioCtx = ngWebAudio.audioContext = newCtx;
  };

  return WebAudio;
}]);
