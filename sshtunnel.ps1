while ($true) {
    ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=5 -R 5077:127.0.0.1:5077 wumbl3priv@86.48.21.11
    Start-Sleep -Seconds 10  # Wait 10 seconds before reconnecting if SSH drops
}
