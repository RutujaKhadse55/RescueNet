# RescueNet R8 ProGuard Obfuscation & Security Hardening (Phase 14)

# Keep React Native core
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep Keystore and SQLCipher native bindings
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }

# Keep BLE & RescueNet native modules
-keep class org.rescuenet.app.** { *; }

# Strip line numbers and source file names in release stack traces for reverse-engineering defense
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# Obfuscate internal class names and dictionaries
-repackageclasses 'org.rescuenet.obf'
-allowaccessmodification
