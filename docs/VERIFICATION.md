# TinyBench v0.3.0 verification

This release adds acquisition diagnostics and recovery to the working sensor-classification workflow. It is not hardware-qualified v1.0.

## Automated checks — passed

- Train the synthetic demonstration and evaluate a separately held-out dataset.
- Confirm changing only held-out test sample values cannot change fitted weights or normalization.
- Enforce whole-session partitions, class coverage, and duplicate-recording checks.
- Reject nonfinite input and invalid CSV rows; check timestamp-derived sample rate.
- Preserve model predictions through JSON serialization/deserialization.
- Compile exported C++ with `g++ -std=c++11` for linear, 12-neuron, and 24-neuron models.
- Compare 54 C++ and JavaScript class scores on actual input windows. Maximum observed absolute difference: **1.0333038058529809e-7**; tolerance: 2e-5.
- Verify generated Arduino ZIP structure and CRCs with Python `zipfile`.
- Compile an exported model containing hostile quote/newline/Unicode label text to verify C++ string escaping.
- Check JavaScript source syntax.

The demonstration's 100% accuracy is expected for simple synthetic signals. It is a workflow test, not a performance claim for real-world applications.

## v0.2 automated acquisition checks — passed

`node tests/test-acquisition.cjs` exercises 15 check groups:

- Byte-fragmented protocol messages, identity, legacy CSV, invalid rows, unsupported versions, and bounded lines.
- Gap/duplicate/out-of-order detection, uint32 sequence and microsecond wrap, bounded percentile storage, cumulative histograms, and batched browser-arrival intervals.
- Clean/interrupted/invalid captures, raw timing preservation, recovery validation, device/project mismatch, and old schema-1 project compatibility.
- Fake Web Serial transport with real Web Streams: no writes to legacy devices, beacon-triggered HELLO, duplicate-open prevention, stall reporting, cancellation/cleanup, retry without another chooser, and unplug errors. This is not a hardware test.
- Host C++ queue tests: retain complete windows, discard overflow safely, reset partial windows on missing samples, and handle uint32 wrap.
- Six generated sketches pass host C++ syntax checks against explicitly mocked Arduino/Mbed/sensor headers. This checks generator syntax, not real board-core API/ABI compatibility, memory fit, threading behavior, or timing.

## Browser checks — passed

The original v0.1 workflow checks below remain recorded as prior evidence; the numerical suite was rerun for v0.2.

- Cold start has an empty project and working navigation.
- Explicitly loading the demo creates 27 labeled recordings and the intended session partitions.
- Real background-worker training completes and creates a saved run.
- Validation metrics appear before test evaluation; test recordings are excluded from replay until test evaluation is requested.
- Held-out evaluation, per-class results, confusion matrix, baseline selection, and model replay render.
- A timestamped CSV was imported through the file chooser, bringing the dataset to 28 recordings.
- Imported data, saved runs, and selected theme persist across page navigation/reload.
- Training another model after import succeeds; baseline comparison distinguishes changed signatures.
- The Arduino export control runs and reports successful generation. The browser automation download-event observer did not return a file path; actual archive structure and compiler behavior were verified through the automated exporter tests above.
- Light and dark desktop rendering and a 390 × 844 CSS-pixel iframe viewport were visually reviewed.

## v0.2 browser checks — passed

- The prior 28-recording project and saved runs restore under v0.2 without a migration error.
- Updated capture page shows device identity, selected-port retry, diagnostics, and all four sketch choices.
- An isolated development fixture provides simulated clean and damaged interruptions. A clean 100-row capture persists through reload and can be kept in the dataset. A missing-sequence capture displays its reason and disables acceptance for training.
- Simulated 50 Hz device input renders a 20 ms interval histogram and expected counters.
- Acquisition panel visually reviewed in light, dark, and high-contrast themes. The mobile 390 × 844 iframe has no horizontal body overflow (375 px content width with its scrollbar).
- Development fixtures are excluded from the release ZIP and from offline assets.

## Not verified in this environment

- No physical Arduino was attached. USB selection, actual sensor capture, port-loss recovery, flashing, target-core compilation, device RAM/flash use, and inference timing require physical-board testing.
- The internal preview used an HTTP hostname rather than HTTPS or localhost. USB and service-worker caching were correctly unavailable there; offline reload was not end-to-end tested on a secure origin.
- JSON file-dialog round-trip was checked at the data-engine level, not end-to-end through the browser chooser.
- Print/PDF report generation is implemented; print-preview pagination was not visually verified.
- No production URL was supplied or deployed. This deliverable is a static self-hosting package.

## Hardware acceptance procedure

1. Serve the package on HTTPS or localhost in desktop Chrome/Edge.
2. Record exact core/library versions; compile and upload each selected capture sketch, close Serial Monitor, and connect explicitly.
3. Confirm TB1 board/sensor identity, channel names/units, and nominal rate. At 50 Hz, run at least 10 minutes; record measured rate, interval histogram, missed/invalid counters, and any stalls. Capture varied independent sessions.
4. Disconnect/reconnect, power-cycle the device, and check that interrupted recordings are identified rather than silently accepted.
5. Train on real data and reserve new sessions for a final held-out test.
6. Install the exported Arduino ZIP, run StaticBuffer, and compare scores with the model fixture.
7. Run matching buffered inference for at least 10 minutes; record RAM/flash, inference time, sample rate, missed/uneven intervals, and dropped windows. Deliberately overload processing and verify that complete-window drops are reported without mixed windows.
8. Export a JSON backup; reload; restore a copy; disconnect the network and reload after offline caching is ready.

## v0.3 verification

15 learning checks pass: known-frequency features, held-out isolation for all tasks and both sensor feature modes, calibration isolation, dataset revision restore, and 10 new C++ output comparisons. Maximum observed absolute difference: 0.00001617523. Existing 54 classification-score comparisons continue to pass. Browser worker training, held-out regression metrics/replay, and anomaly calibration/results were exercised in an isolated synthetic fixture. No physical-device result is implied.

## v0.4.0 audio batch

Seven audio test groups pass: PCM16 WAV round trip, malformed input and region bounds, anti-alias resampling (48 kHz to 16 kHz), audio training, source-partition leakage rejection, 37 C++ feature/score comparisons (maximum absolute difference 1.662e-7), and PCM packet decoding. Browser QA decoded a generated WAV through the production decoder, saved a labeled region, and trained the 18-session synthetic audio dataset with 100% validation (9 windows / 3 sessions). This is workflow evidence, not measured speech recognition. The operating-system file chooser and physical microphones were not exercised.

Actual Arduino Mbed OS Nano core 4.6.0 builds passed using Arduino CLI 1.4.0: NanoSenseRev2Buffered (129480 bytes flash / 54088 static RAM) and NanoSenseAudio (100672 / 81640). No board was connected. PDM hardware, USB throughput, sustained sampling, latency and dynamic stack use remain unverified.

## v0.5.0 local worker batch

Six HTTP integration groups pass: bearer authentication, Origin/Host rejection (raw HTTP Host test), static source allowlist, malformed JSON, successful deterministic training/result/artifact, identical-request caching, cancellation, and invalid-project failure. Real TensorFlow CPU 2.20.0 full-int8 conversion produced a 2368-byte model from 105 representative training windows; the validation-fixture maximum absolute score difference was 0.00362588. Actual Arduino CLI worker compile for Nano 33 IoT / SAMD 1.8.14 passed (27960 bytes flash, 3564 static RAM), and returned a checksummed ZIP. PDM capture also compiles on Mbed Nano 4.6.0 (87560 bytes flash, 48856 static RAM). Docker and TensorFlow Lite Micro firmware were not run.

Browser UI also connected to the real optional worker through the same origin, submitted the synthetic sensor dataset, polled the job to completion, and added the returned model to the existing notebook (100% validation across 42 windows / six synthetic sessions).

## v1.0 software hardening

The five automated suites pass: 9 core-engine groups, 15 acquisition groups, 16 richer-learning groups, 8 audio groups and 6 local-service groups. Across the numerical suites, 101 C++ feature/score values are compared (54 original classifier, 10 regression/anomaly/spectral outputs, 37 audio features/scores). The largest absolute difference is 0.00001618 in the richer-learning suite. Thresholds are numerical tolerances, not bit-identity claims.

Model export accepts only known weight-array names, so an extra imported model property cannot inject a generated C++ declaration. Model architecture, target scaling, labels, channels and optional evidence metadata receive validation. Dataset revisions clear incompatible capture/audio drafts and training recovery. Schema-1 projects from the earlier sensor releases continue to load; missing task/features retain classification/time-statistic behavior and the original data signature. Unknown schema versions are rejected without overwriting the stored project.

Browser QA on v1.0 loaded a persisted interrupted-training fixture, reloaded the page, restarted its saved recipe, completed training, and evaluated the held-out synthetic set. Atomic IndexedDB revision checking was exercised with two tabs. Detailed acceptance results and environment limitations follow in the final release note.


Final browser acceptance: the first tab saved a recipe change; a second stale tab's write was rejected with “Save blocked · export JSON” and an explanation to export before reload. The newer stored version was not overwritten. Existing schema-1 sensor data and earlier trained runs restored into v1.0. The v1.0 export workspace was visually inspected and captured.

Additional WAV checks verify stereo averaging for PCM24, PCM32 and float32. Float32 regression conversion produced a 980-byte TFLite model; the validation-fixture difference after restoring target units was 2.923e-7. Conversion reports and four capture-build reports are in docs/evidence.

Environment limits: HTTPS-only USB/microphone/offline-cache behavior could not be exercised on the preview's insecure hostname. Web Serial transport was tested with fake Web Streams; no physical devices. The cloud browser's download-event wait timed out, so the final browser download completion is unverified; generated ZIP contents/CRC and compiled source were independently verified. The WAV decoder/region/training flow used a visible fixture control rather than the operating-system file chooser. Docker execution and TFLite Micro firmware integration remain unverified. Browser print/report behavior was checked in the initial batch; final print pagination was not requalified.
