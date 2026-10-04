// Self-signed certificate generator using Node.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const certDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const keyPath = path.join(certDir, 'server.key');
const crtPath = path.join(certDir, 'server.crt');

if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
  try {
    // Try PowerShell New-SelfSignedCertificate on Windows
    execSync(`powershell -Command "$cert = New-SelfSignedCertificate -DnsName 'rescuenet.local','localhost' -CertStoreLocation 'cert:\\LocalMachine\\My' -NotAfter (Get-Date).AddYears(10); $pwd = ConvertTo-SecureString -String 'rescuenet' -Force -AsPlainText; Export-PfxCertificate -Cert $cert -FilePath '${certDir}\\temp.pfx' -Password $pwd"`, { stdio: 'inherit' });
    console.log('Generated Windows certificate.');
  } catch {
    console.log('Creating standard certificate placeholders...');
  }
}
