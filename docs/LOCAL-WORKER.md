# Optional local worker

The static app is independent of this service. For same-machine training/build jobs, use Node 22+ and start from the extracted package:

```sh
node service/server.cjs
```

Open the printed `http://localhost:8765` address. In Train or Export, expand **Optional local worker**, paste the terminal's token, and connect. The token remains only in that tab's memory. The service uses temporary disk storage, keeps at most 24 jobs, processes one at a time, queues up to four, limits requests to 64 MB, caps Node job heaps at 512 MB and jobs at 10 minutes. Cancel kills the process group on Linux/macOS. On Windows, descendant compiler processes may require manual termination. Restarting the worker removes its jobs/cache; save downloaded results. Browser datasets remain in IndexedDB; the service is not shared project storage.

`Send dataset & train` uses the same deterministic training engine and adds the returned run to the current matching project. TFLite conversion sends the dataset and selected run, takes representative normalized features only from training (at most 500 evenly selected windows), and produces a model, C array, scaler/DSP header, validation-fixture comparison, checksums and manifest. Int8 quantization must be re-evaluated for your application. Anomaly models use the native exporter.

## TensorFlow conversion

```sh
python3 -m venv .venv
.venv/bin/pip install tensorflow-cpu==2.20.0
TINYBENCH_PYTHON="$PWD/.venv/bin/python" node service/server.cjs
```

TensorFlow Lite Micro is not bundled. Its integration template requires a separately supplied runtime and measured arena sizing. The template is not compiled or hardware-qualified in this release. The native C++ Arduino library is the verified deployment path.

## Arduino builds

Install Arduino CLI 1.4.0 from Arduino's official distribution, then:

```sh
arduino-cli core update-index
arduino-cli core install arduino:mbed_nano@4.6.0
arduino-cli core install arduino:samd@1.8.14
arduino-cli lib install "Arduino_BMI270_BMM150@1.2.4" "Arduino_LSM9DS1@1.1.1" "Arduino_LSM6DS3@1.1.0"
TINYBENCH_ARDUINO_CLI="$(command -v arduino-cli)" node service/server.cjs
```

You may set both `TINYBENCH_PYTHON` and `TINYBENCH_ARDUINO_CLI`. The service compiles only its generated StaticBuffer example for allowlisted Sense or IoT targets. It does not accept arbitrary source, execute uploaded commands, install packages on demand, or flash boards. Artifacts include the generated library, binary, compiler report, and exact installed core/CLI versions. Restart after changing toolchains to invalidate the in-process build cache.

## Containers

`docker compose up --build` uses the basic Node worker and binds the host port to loopback. Set `build.target: ml` in compose for TensorFlow conversion. The provided container has CPU, memory, PID limits, a read-only root and writable temporary storage. Arduino CLI/toolchains are not bundled into the container; the documented native setup supports compilation. Container build/runtime verification is pending because Docker was unavailable in the development environment. Initial image/package installation requires internet access; installed training and conversion operate locally.

## Exposure and authentication

Default binding is loopback. This is a single-user local service, not an internet multi-tenant service. A strong generated token protects every API route. Host and Origin checks reject unrelated browser sites. Use an explicit `TINYBENCH_TOKEN` (24+ characters) only when you manage its lifecycle. For a controlled reverse proxy, use TLS, set `TINYBENCH_PUBLIC_ORIGIN` to the exact public origin, and `TINYBENCH_HOSTS` to comma-separated allowed hostnames. Network exposure, trusted reverse-proxy configuration and access policy are operator responsibilities. There is no permissive CORS endpoint. Artifacts/logs may contain sample data or labels; keep them private.
