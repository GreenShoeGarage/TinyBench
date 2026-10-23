# TinyBench TB1 acquisition protocol — v0.2.0

115200 baud, UTF-8/ASCII text, newline delimiters, no more than 4096 characters per line. Firmware does not accept arbitrary commands or flashing requests.

## Identification

The sketch prints `#TB1 READY` on startup and every two seconds until identified. The browser sends `#TB1 HELLO\n` only after recognizing that beacon. The sketch responds with a `#TB1 ` prefix followed by JSON:

```json
{"type":"hello","protocol":1,"firmware":"0.2.0","board":"Nano 33 BLE Sense Rev2","sensor":"BMI270","mode":"capture","rate_hz":50,"axes":[{"name":"ax","unit":"g"},{"name":"ay","unit":"g"},{"name":"az","unit":"g"}],"capabilities":["hello","capture"]}
```

Capture data is CSV:

```csv
seq,timestamp_us,ax,ay,az
0,100000,0.01,0.02,1.00
1,120000,0.02,0.01,0.99
```

The sequence is a uint32 scheduled-slot counter, including slots skipped by the scheduler or unavailable sensor reads. `timestamp_us` is uint32 `micros()` immediately before the read. It measures the host MCU's read timing, not the IMU's internal conversion instant. Natural uint32 wrap is accepted. Repeated, missing, or out-of-order sequence numbers and clock resets are reported. A reset or discontinuity during a capture preserves a recovery draft instead of stitching different segments together.

TB1 numeric data is ignored until valid identity arrives. Unsupported protocol versions and malformed protocol metadata block capture until a valid hello. Channel names, order, units, and nominal rate must match the project. Device settings can be adopted only into an empty project without pending recovery.

Legacy numeric CSV (with optional `timestamp_ms`, `time_ms`, `t_ms`, or `timestamp_us`, and optional `seq`) remains supported. There is no handshake write to unidentified legacy firmware. Legacy data cannot establish board identity or units. Without timestamps, only coarse browser receive timing is available.

## Timing and acceptance

Device-clock capture requires every interval within ±20% of the configured period and mean rate within ±5%. Missing/repeated/out-of-order samples, timestamp resets, format changes, malformed numeric rows, or project mismatch interrupt an active capture. These checks do not resample or interpolate data. Untimestamped streams receive a coarse ±20% average arrival-rate check; USB packet batching is not treated as device jitter.

The histogram counts all measured intervals in the current connection. Minimum/maximum and mean cover that connection. Median and p95 use the most recent 2048 intervals. Per-record diagnostics can be recomputed from preserved raw timestamp/sequence/arrival metadata. Histograms display interval as a percentage of the configured sample period; the middle bin is 95–105%.

The connection states are disconnected, opening/reconnecting, identifying, streaming, monitoring, stalled, and error. Capture streams stall after about 3.5 seconds without frames. Inference has a longer window-aware timeout. No automatic retry occurs. Retry uses the same selected Web Serial port object; if the operating system re-enumerates it, use Connect Arduino to choose the current port. Previously partial captures are never appended after reconnect.

## Recovery

Active captures checkpoint to the project's `recovery` field about once per second, followed by the normal 250 ms save debounce and IndexedDB commit. A disconnect/stall saves the latest available partial rows. Browser crashes can lose the rows since the last successful save; the save indicator remains authoritative.

Pending recovery is excluded from `records`, dataset signatures, training, and test evaluation. A clean partial capture of at least two rows can become a shorter recording; model training still requires a full configured window. Faulty drafts permit raw JSON download and discard. Save JSON includes the full pending recovery for restoration through Open JSON. The raw recovery download is an inspection file, not an importable TinyBench project.

## Buffered inference telemetry

The hello uses `mode: "inference"`, `capabilities: ["hello","inference"]`, `model_id`, and `window`. After HELLO, the firmware prints messages such as:

```text
#TB1 {"type":"prediction","class_index":0,"inference_us":640,"sample_hz":50.000,"missed":0,"dropped":0,"uneven":0,"scores":[0.98,0.01,0.01]}
```

`class_index: -1` means the model score fell below its exported threshold. Labels require the matching saved model run in the browser project. Scores are not calibrated probabilities of correctness. Timing counters accumulate from the sampler's first observed sample; counters are uint32. `sample_hz` covers the last completed window, not every elapsed second. `inference_us` excludes acquisition, queue wait, and serial output.

Only Nano Sense Rev1/Rev2 Mbed examples provide the threaded queue integration. Other Arduino targets can use portable `TinyBenchModel.h` and `TinyBenchStream.h`, but must provide scheduling, locking, and their own sensor adapter. The queue is not intrinsically thread-safe: every push, pop, and counter snapshot must use the same mutex when shared between threads. No I2C calls run in an interrupt handler.

## v1.0 audio extension

`mode: "audio"`, `rate_hz: 16000`, one `audio` axis in `FS`, and capabilities `hello,audio` identify the PDM adapter. Each `#TB1` audio JSON message contains uint32 `seq` and `samples`: base64 encoding of exactly 256 little-endian signed PCM16 values (512 bytes). Divide by 32768 for full-scale float values. Sequence numbers advance even when the ring drops a chunk. USB CDC is required; the nominal 115200 setting is not a physical UART bandwidth promise.

A bounded eight-slot producer/consumer ring collects data in the PDM callback while main-loop serialization/inference runs separately. Missing/duplicate/reordered chunks make a captured clip ineligible for training. Browser disconnect preserves the current board clip for review. Audio inference telemetry's missed/dropped counters count PCM chunks; sample_hz is the nominal PDM configuration, not a measured audio sampling clock. Real microphone timing and USB throughput remain unverified.
