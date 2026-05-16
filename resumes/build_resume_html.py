import markdown
import pathlib

md_path = pathlib.Path(__file__).parent / "resume.md"
html_path = pathlib.Path(__file__).parent / "resume.html"

md_text = md_path.read_text(encoding="utf-8")
body = markdown.markdown(md_text, extensions=["tables"])

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Taha Ahmed - Resume</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: 'Arial', 'Helvetica Neue', sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #1a1a1a;
    max-width: 820px;
    margin: 0 auto;
    padding: 32px 48px;
  }}

  /* Name */
  h1 {{
    font-size: 24pt;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #000;
    margin-bottom: 6px;
  }}

  /* Contact line under name */
  h1 + p {{
    font-size: 9.5pt;
    color: #444;
    margin-bottom: 2px;
  }}

  /* Section headings */
  h2 {{
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #000;
    border-bottom: 1.5px solid #000;
    padding-bottom: 2px;
    margin-top: 20px;
    margin-bottom: 10px;
  }}

  /* Job title / project title */
  h3 {{
    font-size: 10.5pt;
    font-weight: 700;
    color: #000;
    margin-top: 10px;
    margin-bottom: 1px;
  }}

  p {{
    margin-bottom: 5px;
    color: #222;
  }}

  ul {{
    margin-left: 16px;
    margin-bottom: 8px;
  }}

  li {{
    margin-bottom: 3px;
    color: #222;
  }}

  /* Skills table */
  table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6px;
    font-size: 10pt;
  }}
  td {{
    padding: 4px 8px;
    vertical-align: top;
    border: none;
  }}
  td:first-child {{
    font-weight: 700;
    white-space: nowrap;
    width: 30%;
    color: #000;
  }}
  td:last-child {{
    color: #333;
  }}
  tr:nth-child(even) td {{
    background-color: #f7f7f7;
  }}

  hr {{
    display: none;
  }}

  em {{
    color: #555;
    font-style: italic;
  }}

  strong {{
    font-weight: 700;
    color: #000;
  }}

  @media print {{
    body {{ padding: 20px 36px; }}
    h2 {{ page-break-after: avoid; }}
    h3 {{ page-break-after: avoid; }}
  }}
</style>
</head>
<body>
{body}
</body>
</html>"""

html_path.write_text(html, encoding="utf-8")
print(f"HTML written to: {html_path}")
