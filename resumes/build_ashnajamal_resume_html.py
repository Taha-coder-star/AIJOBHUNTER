import pathlib

import markdown


base_dir = pathlib.Path(__file__).parent
md_path = base_dir / "ashnajamal_resume.md"
html_path = base_dir / "ashnajamal_resume.html"

md_text = md_path.read_text(encoding="utf-8")
body = markdown.markdown(md_text, extensions=["sane_lists"])

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ashna Jamal - Resume</title>
<style>
  @page {{
    size: A4;
    margin: 0.34in 0.45in;
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
    font-size: 9.25pt;
    line-height: 1.22;
    color: #111;
    background: #fff;
  }}

  h1 {{
    margin: 0 0 3px;
    font-size: 21pt;
    line-height: 1;
    font-weight: 800;
    letter-spacing: 1px;
    text-align: center;
    text-transform: uppercase;
  }}

  h1 + p,
  h1 + p + p {{
    margin: 0 0 2px;
    font-size: 8.6pt;
    line-height: 1.18;
    text-align: center;
  }}

  h1 + p + p {{
    margin-bottom: 7px;
  }}

  h2 {{
    margin: 7px 0 3px;
    padding-bottom: 2px;
    border-bottom: 1px solid #111;
    font-size: 9.5pt;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }}

  p {{
    margin: 0 0 2px;
  }}

  ul {{
    margin: 0 0 4px 15px;
    padding: 0;
  }}

  li {{
    margin: 0 0 1.2px;
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
      padding: 0.34in 0.45in;
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
