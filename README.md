#ngWebAudio
`ngWebAudio` is an AngularJS module for playing audio using the WebAudio API.

HTML5 Audio is used if WebAudio is unavailable.

One motivation for using WebAudio is that you can **buffer audio on page load
for mobile browsers**. Currently most mobile browsers will not pre-buffer HTML5
audio elements unless it is interacted with, and will also ignore XHR caches.
The work-around is to fetch and cache audio via XHR, and play it back using
the WebAudio.


#Usage
```
angular.module('my-app', ['ngWebAudio'])
  .controller('controller', function($scope, WebAudio) {
    // ...
  });
```
Module: `ngWebAudio`

Service: `WebAudio`

### API
```
var audio = WebAudio(path_to_audio, [options]);  // or
var audio = new WebAudio(path_to_audio, [options]);

// Automatically called on creation if options.buffer = true (default)
// otherwise will be called when audio is first played
audio.buffer();

// Current position in audio track
audio.offset();

audio.play();
audio.stop();
audio.pause();

// Options for audio object
audio.options

// Using WebAudio or HTML Audio fallback
audio.isWebAudio
```

See `demo/demo.html` for an example.

### Options
```
options = {
  buffer = true,
  loop = false,
  gain = 1,
  fallback = false,     // Use HTML5 audio fallback
  retryInterval = 1000  // Retry interval if buffering fails
}
```

### Events
```
audio.onPlay = function() { ... }      // When media starts playing
audio.onStop = function() { ... }      // When media is stopped (with audio.stop())
audio.onEnd = function() { ... }       // When media finishes playing completely (only if loop = false)
audio.onBuffered = function() { ... }  // When media is buffered
```
Callbacks are attached to the `audio` object that is returned.


##Installation
```
bower install ng-webaudio
```


##Testing
```
npm install -g karma-cli
npm install
bower install
karma start
```


##License
MIT licensed. See LICENSE for details.
