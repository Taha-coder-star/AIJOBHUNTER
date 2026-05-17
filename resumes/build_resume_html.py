import pathlib

import markdown


base_dir = pathlib.Path(__file__).parent
md_path = base_dir / "resume.md"
html_path = base_dir / "resume.html"

md_text = md_path.read_text(encoding="utf-8")
body = markdown.markdown(md_text, extensions=["sane_lists"])

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Taha Ahmed - Resume</title>
<style>
  @page {{
    size: A4;
    margin: 0.38in 0.48in;
  }}

  * {{
    box-sizing: border-box;
  }}

  html,
  body {{
    margin: 0;
    padding: 0;
  }}

  body {{
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.3;
    color: #111;
    background: #fff;
  }}

  h1 {{
    margin: 0 0 4px;
    font-size: 22pt;
    line-height: 1;
    font-weight: 800;
    letter-spacing: 1.1px;
    text-align: center;
    text-transform: uppercase;
  }}

  h1 + p,
  h1 + p + p {{
    margin: 0 0 2px;
    font-size: 9pt;
    line-height: 1.25;
    text-align: center;
  }}

  h1 + p + p {{
    margin-bottom: 10px;
  }}

  h2 {{
    margin: 9px 0 5px;
    padding-bottom: 2px;
    border-bottom: 1px solid #111;
    font-size: 10pt;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }}

  p {{
    margin: 0 0 3.5px;
  }}

  ul {{
    margin: 0 0 5.5px 16px;
    padding: 0;
  }}

  li {{
    margin: 0 0 2px;
    padding-left: 1px;
  }}

  strong {{
    font-weight: 700;
  }}

  h2,
  p,
  ul {{
    break-inside: avoid;
  }}

  @media screen {{
    body {{
      max-width: 8.27in;
      min-height: 11.69in;
      margin: 0 auto;
      padding: 0.38in 0.48in;
      box-shadow: 0 0 0 1px #ddd;
    }}
  }}
</style>
</head>
<body>
{body}
</body>
</html>"""

html_path.write_text(html, encoding="utf-8")
print(f"HTML written to: {html_path}")
