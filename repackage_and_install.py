import zipfile
import os
import subprocess

src_apk = r'd:\RescueNet\apps\mobile\android\app\build\outputs\apk\sideload\debug\app-sideload-debug.apk'
bundle_file = r'd:\RescueNet\apps\mobile\android\app\src\main\assets\index.android.bundle'
temp_apk = r'd:\RescueNet\apps\mobile\android\app\build\outputs\apk\sideload\debug\temp_unsigned.apk'
final_apk = r'd:\RescueNet\apps\mobile\android\app\build\outputs\apk\sideload\debug\app-sideload-debug-final.apk'
keystore = r'd:\RescueNet\apps\mobile\android\app\debug.keystore'
sdk = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk')
zipalign = os.path.join(sdk, 'build-tools', '35.0.0', 'zipalign.exe')
apksigner = os.path.join(sdk, 'build-tools', '35.0.0', 'apksigner.bat')
adb = os.path.join(sdk, 'platform-tools', 'adb.exe')

print('1. Repackaging zip with updated JS bundle...')
with zipfile.ZipFile(src_apk, 'r') as zin, zipfile.ZipFile(temp_apk, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename.startswith('META-INF/') or item.filename == 'assets/index.android.bundle':
            continue
        zout.writestr(item, zin.read(item.filename))
    zout.write(bundle_file, 'assets/index.android.bundle')

print('2. Zipalign APK...')
if os.path.exists(final_apk):
    os.remove(final_apk)
subprocess.check_call([zipalign, '-p', '-f', '4', temp_apk, final_apk])
if os.path.exists(temp_apk):
    os.remove(temp_apk)

print('3. Resigning APK with debug.keystore...')
subprocess.check_call([apksigner, 'sign', '--ks', keystore, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', final_apk])

print('4. Installing updated APK to emulator...')
subprocess.check_call([adb, '-s', 'emulator-5554', 'install', '-r', final_apk])

print('5. Restarting RescueNet app...')
subprocess.check_call([adb, '-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'org.rescuenet.app.sideload'])
subprocess.check_call([adb, '-s', 'emulator-5554', 'shell', 'am', 'start', '-n', 'org.rescuenet.app.sideload/org.rescuenet.app.MainActivity'])

print('DEPLOYMENT COMPLETE!')
