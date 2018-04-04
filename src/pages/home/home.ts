import { Component, NgZone } from '@angular/core';
import { NavController } from 'ionic-angular';
import { SpeechRecognition } from '@ionic-native/speech-recognition';
import { SpinnerDialog } from '@ionic-native/spinner-dialog';

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  isListening: boolean = false;
  matches: Array<String>;

  constructor(public navCtrl: NavController, private speechRecognition: SpeechRecognition,
    private zone: NgZone, private spinnerDialog: SpinnerDialog) {

    // Check feature available
    this.speechRecognition.isRecognitionAvailable().then(
      (available: boolean) => {
        console.log('available' + available);
        if (available) {
          // Check permission
          this.speechRecognition.hasPermission().then(
            (hasPermission: boolean) => {
              console.log('hasPermission' + hasPermission);
              if (!hasPermission) {
                this.requestPermission();
              }
            })
        }
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

}
