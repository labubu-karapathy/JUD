import os
import zipfile

dist_dir = os.path.abspath('dist')
zip_path = os.path.abspath('web-dist.zip')
sw_src = os.path.abspath('public/sw.js')
sw_dest = os.path.join(dist_dir, 'sw.js')
if os.path.exists(sw_src):
    import shutil
    shutil.copyfile(sw_src, sw_dest)

print(f"Packing {dist_dir} into {zip_path}...")
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(dist_dir):
        for file in files:
            full_path = os.path.join(root, file)
            arcname = os.path.relpath(full_path, dist_dir)
            z.write(full_path, arcname)

size = os.path.getsize(zip_path)
print(f"Created web-dist.zip ({size:,} bytes / {size / (1024*1024):.2f} MB)")
