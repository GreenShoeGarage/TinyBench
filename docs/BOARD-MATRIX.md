# Board and toolchain evidence — v1.0.0

**Compile-verified is not hardware-qualified. No physical boards were attached.** The native C++ pipeline is the v1.0 deployment path. Flash/static-RAM figures below are compiler reports for specific generated fixtures, not guarantees for every model or peak runtime memory measurements.

Toolchains: Arduino CLI 1.4.0; Arduino Mbed OS Nano Boards 4.6.0; Arduino SAMD Boards 1.8.14. Official index downloads were verified against their SHA-256 checksums. Sensor libraries: Arduino_BMI270_BMM150 1.2.4, Arduino_LSM9DS1 1.1.1, Arduino_LSM6DS3 1.1.0. PDM comes with the Mbed core.

| Target / example | FQBN | Compile | Flash bytes | Static RAM bytes | Physical test |
| --- | --- | --- | ---: | ---: | --- |
| Sense Rev2 IMU capture | arduino:mbed_nano:nano33ble | Passed | 116000 | 46640 | Pending |
| Sense Rev1 IMU capture | arduino:mbed_nano:nano33ble | Passed | 95040 | 45976 | Pending |
| Nano 33 IoT IMU capture | arduino:samd:nano_33_iot | Passed | 24792 | 4300 | Pending |
| Generic A0 capture on Nano 33 IoT | arduino:samd:nano_33_iot | Passed | 12612 | 3616 | Pending |
| Sense Rev2 buffered spectral classifier | arduino:mbed_nano:nano33ble | Passed | 129480 | 54088 | Pending |
| Sense PDM capture (Rev1/Rev2 adapter) | arduino:mbed_nano:nano33ble | Passed | 87560 | 48856 | Pending |
| Sense audio classifier, 8192-sample window | arduino:mbed_nano:nano33ble | Passed | 100672 | 81640 | Pending |
| Nano 33 IoT StaticBuffer classifier via worker | arduino:samd:nano_33_iot | Passed | 27960 | 3564 | Pending |

Rev1 buffered inference shares the tested queue implementation and passes host/mock-header checks but has not received its own target-core build here. Generic A0 on other boards and the other selectable board families are portable-source candidates only. Regression and anomaly C++ runtimes pass host compilation/parity; the target-core build table above uses classification fixtures. Runtime stack, peripherals, RTOS objects, dynamic allocations and arena space must be measured separately.

## Physical acceptance checklist

For each board/revision, retain firmware, exact core/library versions, model/checksums, raw capture logs and the measured results:

1. Upload capture sketch. Verify board identity, sensor, channel order, units and nominal rate against actual hardware. Check static orientation/reference input and device clock behavior.
2. Capture at least 60 seconds repeatedly. Measure intervals and drop counts; unplug/replug, restart and stall the device. Confirm recovery preserves partial data and never joins disconnected sessions.
3. Upload StaticBuffer and compare its output to the saved model fixture within documented numerical tolerance.
4. Run buffered inference for at least ten minutes under representative USB and sensor conditions. Measure min/median/p95/max inference latency, interval jitter, queue drops, peak stack and free memory.
5. For PDM, verify microphone gain, source scaling, real sample rate, callback cadence and sustained USB packet throughput. The displayed 16 kHz is nominal, not a measured audio clock. Counters are PCM chunks (256 samples), not inference windows. Sequence gaps invalidate training clips.
6. Collect independent real sessions across expected subjects, mounting and environments. Re-evaluate deployment performance and unknown/background behavior. Synthetic tests do not satisfy this gate.
7. Treat TFLite Micro as a separate integration: install/pin a compatible runtime, compile required operators, measure arena use, and compare float/int8 outputs and full held-out metrics on the target.
