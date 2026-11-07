from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
output=root/'dist/Christmas-Carol-1.4.18.mcworld'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted((root/'world').rglob('*')):
        if p.is_file():z.write(p,p.relative_to(root/'world').as_posix())
with zipfile.ZipFile(output) as z:assert z.testzip() is None
print(output)
