from PIL import Image, ImageDraw, ImageFont
import os

def create_passport_image():
    # Create a white image
    width = 600
    height = 400
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)

    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Draw Passport Layout
    draw.rectangle([(10, 10), (590, 390)], outline="black", width=2)
    draw.text((20, 20), "PASSPORT", font=font_large, fill="black")
    draw.text((400, 20), "Type: P", font=font_medium, fill="black")
    
    # Photo Placeholder
    draw.rectangle([(20, 80), (150, 250)], outline="black", width=1)
    draw.text((40, 150), "PHOTO", font=font_small, fill="black")

    # Details
    # Intentionally using a different DOB than DB (DB has 1990-01-01)
    draw.text((180, 80), "Surname: DOE", font=font_medium, fill="black")
    draw.text((180, 120), "Given Names: JOHN", font=font_medium, fill="black")
    draw.text((180, 160), "Nationality: USA", font=font_medium, fill="black")
    draw.text((180, 200), "Date of Birth: 1990-01-02", font=font_medium, fill="black") # Mismatch!
    draw.text((180, 240), "Sex: M", font=font_medium, fill="black")
    
    draw.text((20, 300), "Passport No: A12345678", font=font_large, fill="black")
    draw.text((300, 300), "Expiry: 2030-01-01", font=font_medium, fill="black")

    # Save
    output_path = "documents/dummy_passport.png"
    image.save(output_path)
    print(f"Created {output_path}")

if __name__ == "__main__":
    create_passport_image()
