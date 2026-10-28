import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const isWindows = process.platform === 'win32'
const env = { ...process.env }
const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (isWindows ? join(homedir(), 'AppData/Local/Android/Sdk') : join(homedir(), 'Android/Sdk'))
if (!existsSync(sdk)) throw new Error('Android SDK not found. Set ANDROID_HOME to your SDK directory.')
env.ANDROID_HOME = sdk
env.ANDROID_SDK_ROOT = sdk
if (!env.JAVA_HOME && isWindows) {
  const bundled = join(homedir(), '.codex/tools/android-build/jdk')
  const candidates = [
    'C:/Program Files/Android/Android Studio/jbr',
    ...(existsSync(bundled) ? readdirSync(bundled).map((entry) => join(bundled, entry)) : []),
  ]
  env.JAVA_HOME = candidates.find((candidate) => existsSync(join(candidate, 'bin/java.exe')))
}
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
if (env.JAVA_HOME) env[pathKey] = `${join(env.JAVA_HOME, 'bin')}${isWindows ? ';' : ':'}${env[pathKey] ?? ''}`

// --release: підписаний постійним ключем APK для GitHub Releases (ключ — у KAST_KEYSTORE / KAST_KEYSTORE_PASSWORD)
const release = process.argv.includes('--release')
if (release && (!env.KAST_KEYSTORE || !existsSync(env.KAST_KEYSTORE) || !env.KAST_KEYSTORE_PASSWORD))
  throw new Error('Release build needs KAST_KEYSTORE (path to the .jks) and KAST_KEYSTORE_PASSWORD.')
const args = ['--no-daemon', ...(release ? [':app:assembleRelease'] : [':app:assembleDebug', ':app:lintDebug'])]
const result = isWindows
  ? spawnSync(env.ComSpec ?? 'C:/Windows/System32/cmd.exe', ['/d', '/c', 'gradlew.bat', ...args], { cwd: join(root, 'android'), env, stdio: 'inherit' })
  : spawnSync('./gradlew', args, { cwd: join(root, 'android'), env, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const output = join(root, 'dist/android')
mkdirSync(output, { recursive: true })
const apk = join(output, release ? `Kast-Android-${version}.apk` : `Kast-Android-${version}-debug.apk`)
copyFileSync(join(root, release ? 'android/app/build/outputs/apk/release/app-release.apk' : 'android/app/build/outputs/apk/debug/app-debug.apk'), apk)
console.log(`\nAPK ready: ${apk}`)
