const say = require('say');

class TTSService {
    constructor() {
        this.isSpeaking = false;
    }

    speak(text, voice = null) {
        return new Promise((resolve, reject) => {
            if (this.isSpeaking) {
                this.stop();
            }

            this.isSpeaking = true;
            say.speak(text, voice, 1.0, (err) => {
                this.isSpeaking = false;
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    stop() {
        say.stop();
        this.isSpeaking = false;
    }
}

module.exports = new TTSService();