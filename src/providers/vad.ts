import { Injectable } from "@angular/core";

@Injectable()
export class VAD {
    energy: any;
    filter: any[];
    log_limit: number;
    log_i: number;
    logging: boolean;
    scriptProcessorNode: any;
    floatFrequencyDataLinear: Float32Array;
    floatFrequencyData: Float32Array;
    analyser: any;
    voiceTrendEnd: number;
    voiceTrendStart: number;
    voiceTrendMin: number;
    voiceTrendMax: number;
    voiceTrend: number;
    energy_threshold_neg: number;
    energy_threshold_pos: number;
    energy_offset: number;
    vadState: boolean;
    ready: any;
    iterationPeriod: number;
    iterationFrequency: number;
    hertzPerBin: number;
    signals: number[] = [];
    maxSignal: number;
    minSignal: number;
    voiceTrendArr = [];
    signalTrend = [];
    // Default options
    options = {
        fftSize: 1024,
        bufferLen: 1024,
        voice_stop: function () { },
        voice_start: function () { },
        smoothingTimeConstant: 0.9,
        energy_offset: 1e-8, // The initial offset.
        energy_threshold_ratio_pos: 2, // Signal must be twice the offset
        energy_threshold_ratio_neg: 0.5, // Signal must be half the offset
        energy_integration: 1, // Size of integration change compared to the signal per second.
        filter: [
            { f: 200, v: 0 }, // 0 -> 200 is 0
            { f: 2000, v: 1 } // 200 -> 2k is 1
        ],
        source: null,
        context: null
    };

    constructor() {

    }

    startVAD(options) {
        console.log('startVAD')
        // User options
        for (var option in options) {
            if (options.hasOwnProperty(option)) {
                this.options[option] = options[option];
            }
        }

        // Require source
        if (!this.options.source)
            throw new Error("The options must specify a MediaStreamAudioSourceNode.");
        console.log('Set this.options.context')
        // Set this.options.context
        this.options.context = this.options.source.context;
        // Calculate time relationships
        console.log(JSON.stringify(this.options));
        this.hertzPerBin = this.options.context.sampleRate / this.options.fftSize;
        this.iterationFrequency = this.options.context.sampleRate / this.options.bufferLen;
        this.iterationPeriod = 1 / this.iterationFrequency;

        var DEBUG = true;
        if (DEBUG) console.log(
            'Vad' +
            ' | sampleRate: ' + this.options.context.sampleRate +
            ' | hertzPerBin: ' + this.hertzPerBin +
            ' | iterationFrequency: ' + this.iterationFrequency +
            ' | iterationPeriod: ' + this.iterationPeriod
        );
        this.setFilter(this.options.filter);

        this.ready = {};
        this.vadState = false; // True when Voice Activity Detected
        // Energy detector props
        this.energy_offset = this.options.energy_offset;
        this.energy_threshold_pos = this.energy_offset * this.options.energy_threshold_ratio_pos;
        this.energy_threshold_neg = this.energy_offset * this.options.energy_threshold_ratio_neg;

        this.voiceTrend = 0;
        this.voiceTrendMax = 10;
        this.voiceTrendMin = -10;
        this.voiceTrendStart = 5;
        this.voiceTrendEnd = -5;
        // Create analyser 
        this.analyser = this.options.context.createAnalyser();
        this.analyser.smoothingTimeConstant = this.options.smoothingTimeConstant; // 0.99;
        this.analyser.fftSize = this.options.fftSize;

        this.floatFrequencyData = new Float32Array(this.analyser.frequencyBinCount);
        // Setup local storage of the Linear FFT data
        this.floatFrequencyDataLinear = new Float32Array(this.floatFrequencyData.length);
        // Connect this.analyser
        this.options.source.connect(this.analyser);
        // Create ScriptProcessorNode
        this.scriptProcessorNode = this.options.context.createScriptProcessor(this.options.bufferLen, 1, 1);
        // Connect scriptProcessorNode (Theretically, not required)
        this.scriptProcessorNode.connect(this.options.context.destination);
        // Create callback to update/analyze floatFrequencyData
        var self = this;
        this.scriptProcessorNode.onaudioprocess = function (event) {
            self.analyser.getFloatFrequencyData(self.floatFrequencyData);
            self.update();
            self.monitor();
        };

        // Connect scriptProcessorNode
        this.options.source.connect(this.scriptProcessorNode);

        // log stuff
        this.logging = false;
        this.log_i = 0;
        this.log_limit = 100;
    }

    setFilter(shape) {
        this.filter = [];
        for (var i = 0, iLen = this.options.fftSize / 2; i < iLen; i++) {
            this.filter[i] = 0;
            for (var j = 0, jLen = shape.length; j < jLen; j++) {
                if (i * this.hertzPerBin < shape[j].f) {
                    this.filter[i] = shape[j].v;
                    break; // Exit j loop
                }
            }
        }
    }

    triggerLog(limit) {
        this.logging = true;
        this.log_i = 0;
        this.log_limit = typeof limit === 'number' ? limit : this.log_limit;
    }

    log(msg) {
        if (this.logging && this.log_i < this.log_limit) {
            this.log_i++;
            console.log(msg);
        } else {
            this.logging = false;
        }
    }

    update() {
        // Update the local version of the Linear FFT
        var fft = this.floatFrequencyData;
        for (var i = 0, iLen = fft.length; i < iLen; i++) {
            this.floatFrequencyDataLinear[i] = Math.pow(10, fft[i] / 10);
        }
        this.ready = {};
    }

    getEnergy() {
        if (this.ready.energy) {
            return this.energy;
        }

        var energy = 0;
        var fft = this.floatFrequencyDataLinear;

        for (var i = 0, iLen = fft.length; i < iLen; i++) {
            energy += this.filter[i] * fft[i] * fft[i];
        }

        this.energy = energy;
        this.ready.energy = true;

        return energy;
    }

    monitor() {

        var energy = this.getEnergy();
        // console.log('energy'); console.log(energy);
        var signal = energy - this.energy_offset;
        this.signals.push(energy);
        // console.log('energy_offset'); console.log(this.energy_offset);
        // console.log('signal'); console.log(signal);
        // console.log('energy_threshold_pos'); console.log(this.energy_threshold_pos);
        // console.log('energy_threshold_neg'); console.log(this.energy_threshold_neg);
        if (signal > this.energy_threshold_pos) {
            // console.log('signal > this.energy_threshold_pos');
            this.voiceTrend = (this.voiceTrend + 1 > this.voiceTrendMax) ? this.voiceTrendMax : this.voiceTrend + 1;
        } else if (signal < -this.energy_threshold_neg) {
            // console.log('signal < -this.energy_threshold_neg')
            this.voiceTrend = (this.voiceTrend - 1 < this.voiceTrendMin) ? this.voiceTrendMin : this.voiceTrend - 1;
        } else {
            // console.log('voiceTrend gets smaller')
            // voiceTrend gets smaller
            if (this.voiceTrend > 0) {
                this.voiceTrend--;
            } else if (this.voiceTrend < 0) {
                this.voiceTrend++;
            }
        }
        this.signals = this.signals.sort();
        this.maxSignal = this.signals[this.signals.length - 1];
        this.minSignal = this.signals[0]
        // console.log("maxSignal"); console.log(this.maxSignal);
        // console.log("minSignal"); console.log(this.minSignal);
        var start = false, end = false;
        // console.log("voiceTrend"); console.log(this.voiceTrend);
        this.voiceTrendArr.push(this.voiceTrend);
        this.signalTrend.push(signal);
        if (this.voiceTrend > this.voiceTrendStart) {
            // Start of speech detected
            // console.log("Start of speech detected");
            start = true;

        } else if (this.voiceTrend < this.voiceTrendEnd) {
            // End of speech detected
            // console.log("End of speech detected");
            end = true;

        }
        // Integration brings in the real-time aspect through the relationship with the frequency this functions is called.
        var integration = signal * this.iterationPeriod * this.options.energy_integration;

        // Idea?: The integration is affected by the voiceTrend magnitude? - Not sure. Not doing atm.

        // The !end limits the offset delta boost till after the end is detected.
        if (integration > 0 || !end) {
            this.energy_offset += integration;
        } else {
            this.energy_offset += integration * 10;
        }
        this.energy_offset = this.energy_offset < 0 ? 0 : this.energy_offset;
        this.energy_threshold_pos = this.energy_offset * this.options.energy_threshold_ratio_pos;
        this.energy_threshold_neg = this.energy_offset * this.options.energy_threshold_ratio_neg;

        // Broadcast the messages
        if (start && !this.vadState) {
            this.vadState = true;
            this.options.voice_start();
            console.log('voice start triggered');
            // this.voiceTrendArr = [];
            // this.signalTrend = [];
        }
        if (end && this.vadState) {
            this.vadState = false;
            this.options.voice_stop();
            // console.log('energy_threshold_pos'); console.log(this.energy_threshold_pos);
            // console.log('energy_threshold_neg'); console.log(this.energy_threshold_neg);
            console.log('voice end triggered');
            // console.log(this.voiceTrendArr)
            // console.log(this.signalTrend);
        }

        this.log(
            'e: ' + energy +
            ' | e_of: ' + this.energy_offset +
            ' | e+_th: ' + this.energy_threshold_pos +
            ' | e-_th: ' + this.energy_threshold_neg +
            ' | signal: ' + signal +
            ' | int: ' + integration +
            ' | voiceTrend: ' + this.voiceTrend +
            ' | start: ' + start +
            ' | end: ' + end
        );

        return signal;
    }

}