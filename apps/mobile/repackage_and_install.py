import os
import sys
import zipfile
import shutil
import subprocess
import glob

def main():
    sdk_dir = os.environ.get('LOCALAPPDATA', '') + r'\Android\Sdk'
    build_tools_list = glob.glob(os.path.join(sdk_dir, 'build-tools', '*'))
    if not build_tools_list:
        print("Build tools not found!")
        sys.exit(1)
    
    # Pick latest build tools
    build_tools = sorted(build_tools_list)[-1]
    zipalign = os.path.join(build_tools, 'zipalign.exe')
    apksigner = os.path.join(build_tools, 'apksigner.bat')
    adb = os.path.join(sdk_dir, 'platform-tools', 'adb.exe')

    apk_dir = r'd:\RescueNet\apps\mobile\android\app\build\outputs\apk\sideload\debug'
    base_apk = os.path.join(apk_dir, 'app-sideload-debug.apk')
    bundle_file = r'd:\RescueNet\apps\mobile\android\app\src\main\assets\index.android.bundle'
    keystore = r'd:\RescueNet\apps\mobile\android\app\debug.keystore'

    temp_apk = os.path.join(apk_dir, 'app-temp.apk')
    aligned_apk = os.path.join(apk_dir, 'app-aligned.apk')
    final_apk = os.path.join(apk_dir, 'app-sideload-debug-final.apk')

    print(f"Reading base APK: {base_apk}")
    print(f"Injecting bundle: {bundle_file} ({os.path.getsize(bundle_file)} bytes)")

    # Read base APK and rewrite without old bundle and signatures
    with zipfile.ZipFile(base_apk, 'r') as zin:
        with zipfile.ZipFile(temp_apk, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == 'assets/index.android.bundle' or item.filename.startswith('META-INF/'):
                    continue
                zout.writestr(item, zin.read(item.filename))
            zout.write(bundle_file, 'assets/index.android.bundle')

    print("Zipaligning APK...")
    if os.path.exists(aligned_apk):
        os.remove(aligned_apk)
    subprocess.run([zipalign, '-v', '-p', '4', temp_apk, aligned_apk], check=True, stdout=subprocess.DEVNULL)

    print("Signing APK with apksigner...")
    subprocess.run([
        apksigner, 'sign',
        '--ks', keystore,
        '--ks-pass', 'pass:android',
        '--key-pass', 'pass:android',
        '--ks-key-alias', 'androiddebugkey',
        '--out', final_apk,
        aligned_apk
    ], check=True)

    if os.path.exists(temp_apk):
        os.remove(temp_apk)
    if os.path.exists(aligned_apk):
        os.remove(aligned_apk)

    print(f"Successfully generated signed APK: {final_apk} ({os.path.getsize(final_apk)} bytes)")

    print("Installing to Android Emulator...")
    install_res = subprocess.run([adb, 'install', '-r', final_apk], capture_output=True, text=True)
    print(install_res.stdout)
    if install_res.stderr:
        print(install_res.stderr)

    print("Relaunching RescueNet app on emulator...")
    subprocess.run([
        adb, 'shell', 'am', 'start', '-n',
        'org.rescuenet.app.sideload/org.rescuenet.app.MainActivity'
    ], check=True)
    print("Done!")

if __name__ == '__main__':
    main()
