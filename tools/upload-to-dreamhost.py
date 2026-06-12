import paramiko, os

dist = r"C:\Users\Tolch\Documents\AI_Code\WebToe\apps\web\dist"
remote_base = "/home/dh_awpnn6/tolchx.com/webtoe"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("iad1-shared-b8-01.dreamhost.com", username="dh_awpnn6", password="[REDACTED]")
sftp = ssh.open_sftp()

n = 0
for root, dirs, files in os.walk(dist):
    for fname in files:
        local = os.path.join(root, fname)
        rel = os.path.relpath(local, dist).replace("\\", "/")
        remote = f"{remote_base}/{rel}"
        remote_dir = os.path.dirname(remote).replace("\\", "/")
        try:
            sftp.stat(remote_dir)
        except:
            parts = remote_dir.split("/")
            for i in range(3, len(parts) + 1):
                p = "/".join(parts[:i])
                try:
                    sftp.stat(p)
                except:
                    sftp.mkdir(p)
        sftp.put(local, remote)
        n += 1
        if n <= 4:
            print(f"  uploaded: {rel}")

sftp.close()
ssh.close()
print(f"\nDone — {n} files uploaded to {remote_base}")
