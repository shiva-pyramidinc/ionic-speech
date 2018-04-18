import { Component, NgZone } from '@angular/core';
import { NavController, Platform } from 'ionic-angular';
import { SpeechRecognition } from '@ionic-native/speech-recognition';
import { SpinnerDialog } from '@ionic-native/spinner-dialog';
import { Media, MediaObject } from '@ionic-native/media';
import { File } from '@ionic-native/file';
import { VAD } from '../../providers/vad';
declare let audioinput: any;
declare let webkitAudioContext: any;
@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  streamSource: MediaStreamAudioSourceNode;
  audioContext: AudioContext;
  isListening: boolean = false;
  matches: Array<String>;
  fileName: string;
  filePath: string;
  audio: MediaObject;
  mediaTimer;
  audioDataBuffer = [];
  totalReceivedData = 0;
  audioStream: MediaStream;
  isCapturing: boolean = false;
  speechDetected: boolean = false;

  constructor(public navCtrl: NavController, private speechRecognition: SpeechRecognition,
    private zone: NgZone, private spinnerDialog: SpinnerDialog, private media: Media, public platform: Platform, private file: File,
    private vad: VAD) {

    this.platform.ready().then(() => {
      // this.shimGetUserMedia(window);
      this.captureAudio();
    })
  }

  requestPermission() {
    // Request permissions
    this.speechRecognition.requestPermission().then(
      () => {
        console.log('Granted');
      },
      () => console.log('Denied')
    )
  }

  startListening() {
    this.spinnerDialog.show("", "Listening ...");
    let $this = this;
    // Start the recognition process
    this.speechRecognition.startListening({ showPopup: false }).subscribe(matches => {
      $this.zone.run(() => {
        this.spinnerDialog.hide();
        $this.matches = matches;
      })
    }, error => console.error(error));
  }

  stopListening() {
    // Stop the recognition process (iOS only)
    this.speechRecognition.stopListening();
    this.spinnerDialog.hide();
  }

  listen(): void {
    console.log('listen action triggered');
    if (this.isListening) {
      this.stopListening();
      this.toggleListenMode();
      return;
    }
    this.toggleListenMode();
    this.startListening();
  }

  toggleListenMode(): void {
    this.isListening = this.isListening ? false : true;
    console.log('listening mode is now : ' + this.isListening);
  }

  startRecord() {
    let now = new Date();
    this.fileName = 'record' + now.getDate() + now.getMonth() + now.getFullYear() + now.getHours() + now.getMinutes() + now.getSeconds();
    if (this.platform.is('ios')) {
      this.fileName += '.m4a';
    } else if (this.platform.is('android')) {
      this.fileName += '.ogg';
    }
    this.filePath = this.getBasePath().replace(/file:\/\//g, '');
    this.audio = this.media.create(this.filePath + this.fileName);
    this.zone.run(() => {
      this.audio.startRecord();
      this.mediaTimer = setInterval(function () {
        // get media amplitude
        this.audio.getCurrentAmplitude(
          // success callback
          function (amp) {
            console.log(amp + "%");
          },
          // error callback
          function (e) {
            console.log("Error getting amp=" + e);
          }
        );
        this.readAsBuffer();
      }, 1000);
    });
  }

  readAsBuffer() {
    this.file.readAsArrayBuffer(this.getBasePath(), this.fileName).then(buffer => {
      console.log(buffer)
    }).catch(err => {
      console.log('readOutResponse error');
      console.log(JSON.stringify(err));
    });
  }

  stopRecord() {
    this.audio.stopRecord();
  }

  getBasePath(): string {
    let basePath = '';
    if (this.platform.is('ios')) {
      basePath = this.file.documentsDirectory;
    } else if (this.platform.is('android')) {
      basePath = this.file.externalDataDirectory;
    }
    return basePath;
  }


  captureAudio() {
    // First check whether we already have permission to access the microphone.
    audioinput.checkMicrophonePermission((hasPermission) => {
      if (hasPermission) {
        console.log("We already have permission to record.");
        this.startCapture();
      }
      else {
        // Ask the user for permission to access the microphone
        audioinput.getMicrophonePermission((hasPermission, message) => {
          if (hasPermission) {
            console.log("User granted us permission to record.");
            this.startCapture();
          } else {
            console.warn("User denied permission to record.");
          }
        });
      }
    });
  }

  shimGetUserMedia(window) {
    console.log('shimGetUserMedia')
    var navigator = window && window.navigator;

    if (!navigator.getUserMedia) {
      console.log('getUserMedia')
      if (navigator.webkitGetUserMedia) {
        console.log('webkitGetUserMedia')
        navigator.getUserMedia = navigator.webkitGetUserMedia.bind(navigator);
      } else if (navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia) {
        console.log('mediaDevices')
        navigator.getUserMedia = function (constraints, cb, errcb) {
          navigator.mediaDevices.getUserMedia(constraints)
            .then(cb, errcb);
        }.bind(navigator);
      } else {
        console.log('None exist', JSON.stringify(navigator));
      }
    } else {
      console.log('getUserMedia exists', navigator.getUserMedia)
    }
  }

  startCapture() {
    try {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        this.isCapturing = true;
        console.log("successCb");
        console.log(stream);
        this.audioStream = stream;
        this.audioContext = new AudioContext();
        this.streamSource = this.audioContext.createMediaStreamSource(stream);
        var options = {
          source: this.streamSource,
          voice_stop: () => { console.log('voice_stop'); this.updateSpeechDetectionStatus(false); },
          voice_start: () => { console.log('voice_start'); this.updateSpeechDetectionStatus(true); }
        };

        // Create VAD
        this.vad.startVAD(options);

      }).catch(err => {
        console.log("err");
        console.log(JSON.stringify(err));
        this.isCapturing = false;
      });
    } catch (e) {
      console.log('e', JSON.stringify(e));
      this.audioInputTest();
    }
  }

  stopCapture() {
    try {
      audioinput.stop();
      var track = this.audioStream.getTracks()[0];  // if only one media track
      track.stop();
      this.streamSource.disconnect();
      this.audioContext.close();
      this.isCapturing = false;
    } catch (e) {
      console.log(JSON.stringify(e));
    }
  }

  updateSpeechDetectionStatus(status: boolean) {
    this.zone.run(() => {
      this.speechDetected = status;
    })
  }

  audioInputTest() {
    this.isCapturing = true;
    audioinput.start({
      streamToWebAudio: true,
      debug: true
    });
    console.log('define audioContext');
    console.dirxml(window); console.log('foo')
    // let audioContext = new (AudioContext || webkitAudioContext)();
    // Connect the audioinput to the device speakers in order to hear the captured sound.
    let audioContext = audioinput.getAudioContext();
    // audioinput.connect(audioContext.destination);

    // let analyser = audioContext.createAnalyser();
    // analyser.fftSize = 2048;
    // audioinput.connect(analyser);

    var self = this;

    function onAudioInput(evt) {

      try {
        if (evt && evt.data) {
          self.totalReceivedData += evt.data.length; // Increase the debug counter for received data
          self.audioDataBuffer = self.audioDataBuffer.concat(evt.data); // Add the chunk to the buffer
        }
      }
      catch (ex) {
        alert("onAudioInputCapture ex: " + ex);
      }
      // 'evt.data' is an integer array containing raw audio data
      //   
      // console.log("Audio data received: " + evt.data.length + " samples");
      // Define function called by getUserMedia 
      // function startUserMedia(stream) {
      // Create MediaStreamAudioSourceNode

      // console.log('source');
      // console.log(source);
      // Setup options
      // var options = {
      //   source: source,
      //   voice_stop: function () { console.log('voice_stop'); },
      //   voice_start: function () { console.log('voice_start'); }
      // };

      // Create VAD
      // var vad = new VAD(options);
      // }
      // ... do something with the evt.data array ...
    }
    function test(evt) {
      console.log('Clicked');
    }
    // Listen to audioinput events
    window.addEventListener("audioinput", onAudioInput, false);
    window.addEventListener("click", test, false);

    var onAudioInputError = function (error) {
      alert("onAudioInputError event recieved: " + JSON.stringify(error));
    };

    // Listen to audioinputerror events
    window.addEventListener("audioinputerror", onAudioInputError, false);

    console.log('isCapturing', audioinput.isCapturing());
    console.log('getAudioContext');
    try {
      var dest = audioContext.createMediaStreamDestination();
      audioinput.connect(dest);
      var streamSource = audioContext.createMediaStreamSource(dest.stream);
      // var streamSource = dest.stream;
      console.log('streamSource');
      console.log(streamSource);
      var options = {
        source: streamSource,
        voice_stop: () => { console.log('voice_stop'); this.updateSpeechDetectionStatus(false); },
        voice_start: () => { console.log('voice_start'); this.updateSpeechDetectionStatus(true); }
      };
      console.log('Create VAD');
      // Create VAD
      this.vad.startVAD(options);

    } catch (e) {
      console.log('ERRR')
      console.log(JSON.stringify(e));
    }

  }

}
