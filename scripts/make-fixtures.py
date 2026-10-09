#!/usr/bin/env python3
"""Generate the EPUB fixtures used by tests and the built-in demo books.

Run from the repo root:  python3 scripts/make-fixtures.py
"""
import os
import subprocess
import zipfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "fixtures", "src")
OUT = os.path.join(ROOT, "fixtures")
PUBLIC = os.path.join(ROOT, "src", "assets", "samples")
os.makedirs(PUBLIC, exist_ok=True)


def font(size):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def cover(path, title, subtitle):
    w, h = 600, 900
    img = Image.new("RGB", (w, h), (28, 36, 52))
    d = ImageDraw.Draw(img)
    # pivot axis motif
    d.line([(w // 2, 120), (w // 2, 200)], fill=(240, 98, 72), width=6)
    d.line([(w // 2, 700), (w // 2, 780)], fill=(240, 98, 72), width=6)
    f = font(56)
    y = 340
    for line in title.split("\n"):
        tw = d.textlength(line, font=f)
        d.text(((w - tw) / 2, y), line, font=f, fill=(244, 241, 236))
        y += 72
    f2 = font(28)
    tw = d.textlength(subtitle, font=f2)
    d.text(((w - tw) / 2, y + 30), subtitle, font=f2, fill=(170, 182, 204))
    img.save(path)


def pandoc(md, out, version, cover_img):
    subprocess.run(
        ["pandoc", md, "-o", out, "-t", version, "--epub-cover-image=" + cover_img, "--toc"],
        check=True,
    )


# 1-2. Demo books (EPUB3 Spanish, EPUB2 English), also shipped with the app.
cover(os.path.join(SRC, "cover-es.png"), "Bienvenido\na Spubber", "Guía de lectura rápida")
cover(os.path.join(SRC, "cover-en.png"), "Welcome\nto Spubber", "A speed reading guide")
pandoc(os.path.join(SRC, "demo-es.md"), os.path.join(PUBLIC, "bienvenido-a-spubber.epub"), "epub3", os.path.join(SRC, "cover-es.png"))
pandoc(os.path.join(SRC, "demo-en.md"), os.path.join(PUBLIC, "welcome-to-spubber.epub"), "epub2", os.path.join(SRC, "cover-en.png"))


def write_epub(path, files, mimetype=True):
    with zipfile.ZipFile(path, "w") as z:
        if mimetype:
            z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, data in files.items():
            z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)


CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

# 3. Quirky EPUB2: windows-1252 chapter, spaces in paths, HTML entities (not
#    well-formed XML), footnote markers, nested NCX with fragments, meta cover,
#    and an href whose case does not match the zip entry.
opf = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Quirky Test Book</dc:title>
    <dc:creator opf:role="aut">Ada Tester</dc:creator>
    <dc:creator opf:role="aut">Bo Example</dc:creator>
    <dc:language>es</dc:language>
    <dc:identifier id="id">urn:uuid:1234</dc:identifier>
    <dc:description>&lt;p&gt;A &lt;b&gt;test&lt;/b&gt; book.&lt;/p&gt;</dc:description>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-img" href="Images/front.png" media-type="image/png"/>
    <item id="titlepage" href="Text/titlepage.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="Text/Chapter%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="titlepage" linear="no"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>"""

ncx = """<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>Capítulo uno</text></navLabel><content src="Text/Chapter%201.xhtml"/>
      <navPoint id="n1a" playOrder="2"><navLabel><text>Una sección</text></navLabel><content src="Text/Chapter%201.xhtml#sec"/></navPoint>
    </navPoint>
    <navPoint id="n2" playOrder="3"><navLabel><text>Capítulo dos</text></navLabel><content src="Text/chapter2.xhtml"/></navPoint>
  </navMap>
</ncx>"""

titlepage = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head>
<body><div><img src="../Images/front.png" alt="Cover"/></div></body></html>"""

ch1 = """<?xml version="1.0" encoding="windows-1252"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Uno</title><style>p{}</style></head>
<body>
<h1>Capítulo uno</h1>
<p>El niño comió piñas&nbsp;y jamón&mdash;mucho jamón.<sup><a href="#fn1">1</a></sup> Después durmió.</p>
<p>Segundo pá&shy;rrafo con <i>cursiva</i> y <b>negrita</b>.<br/>Una línea nueva.</p>
<h2 id="sec">Una sección</h2>
<blockquote><p>Una cita célebre.</p></blockquote>
<ul><li>Primero</li><li>Segundo</li></ul>
<p>Texto con nota<a epub:type="noteref" href="#fn2">2</a> final.
<script>var x = 1;</script>
</body></html>""".encode("windows-1252")

ch2 = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Dos</title></head>
<body>
<h1>Capítulo dos</h1>
<p>Último capítulo. «Comillas» al final.</p>
<aside epub:type="footnote" id="fn2"><p>Esta nota no se lee.</p></aside>
</body></html>"""

png = os.path.join(SRC, "cover-en.png")
with open(png, "rb") as f:
    png_bytes = f.read()

write_epub(
    os.path.join(OUT, "quirky-epub2.epub"),
    {
        "META-INF/container.xml": CONTAINER,
        "OEBPS/content.opf": opf,
        "OEBPS/toc.ncx": ncx,
        "OEBPS/Images/front.png": png_bytes,
        "OEBPS/Text/titlepage.xhtml": titlepage,
        "OEBPS/Text/Chapter 1.xhtml": ch1,
        "OEBPS/text/Chapter2.xhtml": ch2,  # case mismatch on purpose
    },
)

# 4. DRM-protected (encrypted chapter) and 5. font-obfuscated only (readable).
def simple_book(extra):
    files = {
        "META-INF/container.xml": CONTAINER,
        "OEBPS/content.opf": """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Simple</dc:title><dc:language>en</dc:language></metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>""",
        "OEBPS/c1.xhtml": """<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello world.</p></body></html>""",
    }
    files.update(extra)
    return files


def encryption(alg, uri):
    return f"""<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData><enc:EncryptionMethod Algorithm="{alg}"/>
    <enc:CipherData><enc:CipherReference URI="{uri}"/></enc:CipherData></enc:EncryptedData>
</encryption>"""


write_epub(os.path.join(OUT, "drm.epub"), simple_book({
    "META-INF/encryption.xml": encryption("http://www.w3.org/2001/04/xmlenc#aes128-cbc", "OEBPS/c1.xhtml"),
}))
write_epub(os.path.join(OUT, "font-obfuscated.epub"), simple_book({
    "META-INF/encryption.xml": encryption("http://www.idpf.org/2008/embedding", "OEBPS/fonts/a.otf"),
}))

# 6. Not an EPUB at all.
with open(os.path.join(OUT, "not-a-zip.epub"), "wb") as f:
    f.write(b"%PDF-1.4 this is not a zip")

print("fixtures ok")
