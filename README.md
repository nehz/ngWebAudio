#ngWebAudio
`ngWebAudio` is an AngularJS module to play audio using the WebAudio API with
HTML5 Audio fallback.

One motivation for using WebAudio API is that you can buffer audio on page load
for mobile browsers. Currently most mobile browsers will not pre-buffer HTML5
audio elements unless it is interacted with, and will ignore XHR caches.
Using WebAudio, we can fetch and cache audio via XHR, and play it back using
the WebAudio API.


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
var audio = WebAudio(path_to_audio, [options]);

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
```

### Options
```
options = {
  buffer = true,
  loop = false,
  gain = 1,
  retryInterval = 1000  // Retry interval if buffering fails
}
```


##Installation
```
bower install ngWebAudio
```

##Testing
```
npm install -g karma-cli
npm install
bower install
karma test
```

##License
MIT licensed. See LICENSE for details.
