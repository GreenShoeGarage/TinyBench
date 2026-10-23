# TinyBench release roadmap

| Batch | Status | Delivered |
| --- | --- | --- |
| v0.1 | Complete | Local sensor classification from data capture through Arduino export |
| v0.2 | Complete in software | Device protocol, diagnostics, partial capture recovery, buffered IMU inference |
| v0.3 | Complete | Spectral features, regression, calibrated anomaly scoring, session metrics, dataset revisions |
| v0.4 | Complete in software | WAV/microphone/PDM paths, labeled audio regions, shared audio DSP, audio inference examples |
| v0.5 | Complete | Optional local worker, TensorFlow int8/float conversion, native Arduino build, cancellation and cache |
| v1.0 | Software release complete | Import validation, interrupted-training restart, atomic tab-save conflict detection, installation and explicit compile matrix |

## Outstanding hardware qualification

The original v1.0 roadmap included physical-board acceptance. No boards are available in this environment, so that gate is **not complete**. v1.0 is explicitly a software release. Do not label the boards hardware-qualified until the checklist in BOARD-MATRIX.md is executed and measured evidence is retained. The original audio “bit-consistent” goal is refined to numerical agreement within a documented tolerance because the JS and embedded implementations use different floating-point precision.

Next qualification work: Nano Sense Rev2 first, then Rev1 and Nano 33 IoT; repeated attach/detach/restart; capture jitter and gaps; sustained buffered inference; audio gain/throughput/queue behavior; measured stack/arena/memory and latency; real held-out accuracy. Qualify the TFLite Micro integration separately from native inference. Exercise Docker on a clean host.

## After qualification

Consider camera classification on suitable hardware, additional sensor adapters, richer audio features, shared self-hosted project storage, and external training adapters. These are candidates, not included v1.0 capabilities.
