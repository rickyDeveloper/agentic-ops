from PIL import Image, ImageDraw, ImageFont
import os

def create_image(filename, text_lines, title="DOCUMENT"):
    width = 600
    height = 400
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()

    draw.rectangle([(10, 10), (590, 390)], outline="black", width=2)
    draw.text((20, 20), title, font=font_large, fill="black")
    
    y = 80
    for line in text_lines:
        draw.text((20, y), line, font=font_medium, fill="black")
        y += 40

    output_path = os.path.join("documents", filename)
    image.save(output_path)
    print(f"Created {output_path}")

def generate_docs():
    # 1. Perfect Match (Jane Smith)
    create_image("jane_license.png", [
        "License No: D98765432",
        "Surname: SMITH",
        "First Name: JANE",
        "DOB: 1985-05-15",
        "Type: DRIVING_LICENSE"
    ], "DRIVING LICENSE")

    # 2. Name Mismatch (Alice Wonder vs Wonderland)
    create_image("alice_passport.png", [
        "Passport No: P11223344",
        "Surname: WONDERLAND",  # Mismatch! DB says WONDER
        "Given Names: ALICE",
        "DOB: 1992-03-10",
        "Nationality: UK"
    ], "PASSPORT")

    # 3. ID Not Found (Unknown Person)
    create_image("unknown_id.png", [
        "ID No: X99999999",     # Not in DB
        "Name: STRANGER DANGER",
        "DOB: 2000-01-01"
    ], "ID CARD")

    # 4. Perfect Match (Bob Builder)
    create_image("bob_license.png", [
        "License No: L55667788",
        "Name: BOB BUILDER",
        "DOB: 1980-11-20"
    ], "DRIVING LICENSE")

if __name__ == "__main__":
    generate_docs()
