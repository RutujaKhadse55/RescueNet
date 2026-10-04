# @rescuenet/mobile

Bare React Native mobile client for Android (API 26 to 35) and iOS, featuring the New Architecture, Hermes JS engine, and native BLE mesh modules.

## Architecture Highlights

- **Package**: `org.rescuenet.app`
- **Min SDK**: 26 (Android 8.0 Oreo)
- **Target SDK**: 35 (Android 15)
- **Engine**: Hermes with React Native New Architecture (TurboModules & Fabric enabled).
- **Core Link**: Direct workspace dependency on `@rescuenet/core` for zero-overhead binary packet serialization and signature verification.

## Public API & Native Bridge Contracts

In upcoming phases, native modules will bridge via TypeScript interfaces:

- `IBleTransport`: Custom Kotlin peripheral (advertising + GATT server) and central (scanning + GATT client).
- `ISmsTransport`: Fallback compact SMS transmission for disaster zones.
- `ILocationProvider`: High-accuracy fused location provider.
- `IBluetoothController`: State management and user prompt handlers.

## Failure Modes & Platform Limits

Refer to [docs/PLATFORM_LIMITS.md](file:///d:/RescueNet/docs/PLATFORM_LIMITS.md) for details on Android 12+ BLE permission workflows, Android 13+ silent bluetooth enable blocks, Android 14+ foreground service types, and OEM battery killer mitigations.
