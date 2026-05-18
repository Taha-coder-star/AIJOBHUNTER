import pathlib

import markdown


base_dir = pathlib.Path(__file__).parent
md_path = base_dir / "dastyab_launchpad_taha_cover_letter.md"
html_path = base_dir / "dastyab_launchpad_taha_cover_letter.html"

body = markdown.markdown(md_path.read_text(encoding="utf-8"))

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Taha Ahmed - Dastyab Cover Letter</title>
<style>
  @page {{
    size: A4;
    margin: 0.75in;
  }}

  * {{
    box-sizing: border-box;
  }}

  body {{
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #111;
  }}

  h1 {{
    margin: 0 0 24px;
    font-size: 16pt;
    line-height: 1.25;
    text-align: center;
  }}

  p {{
    margin: 0 0 12px;
  }}

  p:last-child {{
    margin-bottom: 0;
  }}

  @media screen {{
    body {{
      max-width: 8.27in;
      min-height: 11.69in;
      margin: 0 auto;
      padding: 0.75in;
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
