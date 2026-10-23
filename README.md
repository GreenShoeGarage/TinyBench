# TinyBench 1.0.0

A self-hosted Arduino learning workbench from Green Shoe Garage. Capture or import sensor/audio recordings, label independent sessions, train a compact model, evaluate held-out data, replay predictions, and export an Arduino C++ library with the exact preprocessing included.

This is an independent implementation inspired by the general Edge Impulse workflow. It uses no Edge Impulse account, backend, SDK, EON compiler, branding, or proprietary code. It is not feature-for-feature Edge Impulse Studio compatibility.

## Start in a minute

Extract this ZIP, then run in its root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://localhost:8000** in a current desktop browser. Choose **Try the demonstration**, inspect the dataset, train, test, and export. The generated library installs through Arduino IDE's **Add .ZIP Library**. Start with its **StaticBuffer** example before connecting sensors. Opening index.html directly does not support background training, audio worklets, or offline caching.

For the optional same-origin local worker, use Node 22+:

```sh
node service/server.cjs
```

Open its printed localhost address and connect using the token printed in the terminal. See [LOCAL-WORKER](docs/LOCAL-WORKER.md) for TensorFlow, Arduino CLI and containers. Browser-only use needs no Node, Python packages, account, npm installation, or frontend build step.

## What v1.0 does

- **Sensor acquisition:** CSV import, Web Serial capture, identified TB1 devices, session labels, timing/gap diagnostics, explicit reconnect, recoverable partial captures. Capture adapters: Nano 33 BLE Sense Rev2, Rev1, Nano 33 IoT, and generic A0.
- **Audio:** WAV import, browser microphone and Nano Sense PDM adapters, editable labeled regions, mono 16 kHz preprocessing, saved source drafts, shared C++ audio features. WAV accepts PCM16/24/32 or float32, mono/stereo, 8–96 kHz, 32 ms–20 seconds.
- **Learning:** linear or 12/24-neuron classifiers; linear or small-network regression; normal-distance anomaly detection with a separate normal calibration partition. Time statistics, spectral sensor features, or 34 framed audio features.
- **Evidence:** session-isolated partitions, duplicate/source-leakage checks, validation-selected weights, explicit held-out testing, confusion matrices or regression errors, per-session metrics, replay, baseline comparison, three dataset revisions and eight model runs.
- **Recovery:** IndexedDB autosave with visible status, JSON backup/restore, capture checkpoints, interrupted-training recipe restart, and atomic save conflict protection between tabs.
- **Deployment:** complete native C++ Arduino library with fixed input fixture and applicable buffered IMU/PDM examples; optional local training, full-int8 or float TFLite conversion, native Arduino CLI compilation, cancellable jobs, manifests, checksums and caching.
- **Interface:** responsive five-step workflow, light/dark/high-contrast themes, keyboard controls, distinct assumptions/evidence, printable report.

## A useful first real experiment

1. Create a project matching your board's channels, units and sampling rate. For audio, choose **New audio project** in Capture. Learning task is selected in project settings before sensor data exists; audio projects begin as classifiers.
2. Capture several independent sessions per class, target range, or normal/anomaly condition. Reuse a session ID for related recordings. Changing subject, mounting, gain or environment often warrants a new session.
3. Review and split sessions before training. Classification auto-split needs at least three sessions per label/label combination. Anomaly needs at least four normal-only sessions and two sessions with anomalies. Put normal-only data in calibration.
4. Train and inspect validation. Use baselines only when task and dataset match. Synthetic demos test the software, not your deployed model's accuracy.
5. Evaluate held-out sessions after choosing the recipe. Repeated tuning against test results requires a new final test set. Export, compile, and compare the included fixed fixture on your board; then qualify real sensor timing and performance.

Audio features use 512-sample Hann frames with 256-sample hop, 16 log power-band means and standard deviations, RMS and zero-crossing rate. These are not MFCCs or a pretrained speech recognizer. Include background/unknown examples and independent recording conditions. Regions from one WAV source cannot cross partitions. Keep browser microphone and Arduino microphone conditions consistent.

## Self-hosting and privacy

Serve the root static files at any directory path on your own web server. There are no CDNs, telemetry, external fonts, analytics, or cloud training calls. USB, microphone and service-worker caching require HTTPS or localhost; Web Serial needs a compatible desktop Chromium browser. CSV/WAV import and training work without USB support. The optional worker receives recordings only when you explicitly submit a job.

Data is stored in this browser profile at this origin. A different port/hostname is a different storage location. **Save JSON regularly**; clearing browser data removes local projects. JSON contains raw recordings, revisions, model parameters and notes, and may contain sensitive audio. Browser storage is not encryption or a shared team database. Offline caching needs one successful online load on a secure origin. Training/conversion can run offline after all required packages and cores are installed.

A stale tab cannot silently overwrite a newer saved project: autosave stops and asks you to export JSON before reloading. A training interruption preserves the recipe and previous models; restart repeats from the seed, not from partial weights. USB sensor capture checkpoints about once per second. Audio drafts persist after stop/import; an abrupt browser crash during active microphone recording can lose the current clip. Interrupted board-audio clips with sequence gaps cannot be kept for training.

## Scope and verification boundary

**v1.0 is a software release, not a hardware-qualified product.** Real Arduino core compilation, C++ parity, TensorFlow conversion, HTTP integration and browser workflows were tested. No physical board was attached. Sustained sampling, microphone behavior, USB bandwidth, dynamic stack use, on-device latency and deployment accuracy remain qualification tasks. See [BOARD-MATRIX](docs/BOARD-MATRIX.md), [VERIFICATION](docs/VERIFICATION.md), and [ROADMAP](docs/ROADMAP.md).

The native C++ export is the tested deployment path. TFLite conversion is tested; its TensorFlow Lite Micro integration template requires a separately installed runtime and has not been compiled or run on hardware. Docker configuration is provided but was not executed in the development environment. The build worker compiles StaticBuffer only; upload uses Arduino IDE/CLI outside TinyBench. Portable source does not certify every Arduino family. AVR-class devices may lack sufficient RAM; favor Nano Sense or another suitable 32-bit target.

There is no image/camera pipeline, large-model training, automatic board flashing, collaborative account system, model fleet management, or Edge Impulse project import in v1.0. Limits: 500 recordings; 200,000 sensor or 2,000,000 audio rows per current dataset; 20,000 sensor or 320,000 audio rows per record; up to 12 classes; 12,000 windows per partition; 128 MB JSON import; 64 MB worker request. Saved revisions duplicate raw data. Class scores are uncalibrated and the uncertain threshold is not an unknown-class detector.

## Files and tests

Root HTML/CSS/JS are the buildless app. `service/` contains the optional Node/Python worker. `docs/` contains protocol, deployment, qualification and verification notes. `examples/` includes a sensor project and CSV. `tests/` runs with Node; C++ parity checks additionally require `g++`:

```sh
node tests/test-engine.cjs
node tests/test-acquisition.cjs
node tests/test-learning.cjs
node tests/test-audio.cjs
node tests/test-service.cjs
```

`CHECKSUMS.sha256` covers the release contents. Source is MIT licensed; third-party Arduino toolchains and TensorFlow retain their own licenses and are installed separately.
