const {spawnSync}=require('child_process'); const fs=require('fs'); const path=require('path');
const root=path.resolve(__dirname,'..'); const mode=process.argv[2]||'debug';
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk){console.error('ANDROID_HOME/ANDROID_SDK_ROOT is not set. Install Android SDK and set the environment variable.');process.exit(2)}
const prep=spawnSync(process.execPath,[path.join(root,'tools/android-prepare.cjs')],{stdio:'inherit'}); if(prep.status!==0)process.exit(prep.status);
const gradlew=process.platform==='win32'?path.join(root,'gradlew.bat'):path.join(root,'gradlew');
if(!fs.existsSync(gradlew)){console.error('Gradle wrapper is not present. Open android/ in Android Studio or generate a Gradle wrapper with a local Gradle installation.');process.exit(3)}
const task=mode==='release'?':app:assembleRelease':':app:assembleDebug';
const r=spawnSync(gradlew,[task],{cwd:path.join(root,'android'),stdio:'inherit',shell:false});process.exit(r.status??1);
