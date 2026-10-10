function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToInt16(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export class MicrophoneCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;

  async start(onChunk: (base64: string, sampleRate: number) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.context = new AudioContext();
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const floats = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(floats.length);
      for (let i = 0; i < floats.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, floats[i]));
        pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      onChunk(
        bytesToBase64(new Uint8Array(pcm.buffer)),
        this.context!.sampleRate,
      );
    };

    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  async stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}

export class PcmPlayer {
  private context: AudioContext | null = null;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();

  async start() {
    this.context = new AudioContext({ sampleRate: 24000 });
    await this.context.resume();
    this.nextStart = this.context.currentTime;
  }

  enqueue(base64: string) {
    if (!this.context) return;
    const pcm = base64ToInt16(base64);
    const buffer = this.context.createBuffer(1, pcm.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) {
      channel[i] = pcm[i] / 0x8000;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime, this.nextStart);
    source.start(startAt);
    this.nextStart = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  clear() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source may already have stopped.
      }
    }
    this.sources.clear();
    if (this.context) this.nextStart = this.context.currentTime;
  }

  async stop() {
    this.clear();
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
    this.context = null;
  }
}
