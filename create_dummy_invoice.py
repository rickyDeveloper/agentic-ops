from PIL import Image, ImageDraw, ImageFont
import os

def create_invoice_image():
    # Create a white image
    width = 800
    height = 1000
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)

    # Try to load a font, fallback to default
    try:
        # This path is common on macOS
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Draw Text
    draw.text((50, 50), "INVOICE", font=font_large, fill="black")
    draw.text((50, 120), "Vendor: Tech Solutions Inc", font=font_medium, fill="black")
    draw.text((50, 160), "Date: 2024-01-15", font=font_small, fill="black")
    draw.text((50, 190), "Invoice #: INV-2024-001", font=font_small, fill="black")

    draw.text((50, 250), "Bill To: Acme Corp", font=font_medium, fill="black")

    # Items Header
    draw.text((50, 320), "Item", font=font_small, fill="black")
    draw.text((400, 320), "Qty", font=font_small, fill="black")
    draw.text((500, 320), "Price", font=font_small, fill="black")
    draw.text((600, 320), "Total", font=font_small, fill="black")
    
    draw.line((50, 340, 750, 340), fill="black", width=2)

    # Item 1
    draw.text((50, 360), "Web Development", font=font_small, fill="black")
    draw.text((400, 360), "1", font=font_small, fill="black")
    draw.text((500, 360), "$1000", font=font_small, fill="black")
    draw.text((600, 360), "$1000", font=font_small, fill="black")

    # Item 2
    draw.text((50, 400), "Hosting Fee", font=font_small, fill="black")
    draw.text((400, 400), "12", font=font_small, fill="black")
    draw.text((500, 400), "$50", font=font_small, fill="black")
    draw.text((600, 400), "$600", font=font_small, fill="black")

    draw.line((50, 440, 750, 440), fill="black", width=2)

    # Total
    draw.text((500, 460), "Total:", font=font_medium, fill="black")
    draw.text((600, 460), "$1600", font=font_medium, fill="black")

    # Save
    output_path = "invoices/sample_invoice.png"
    image.save(output_path)
    print(f"Created {output_path}")

if __name__ == "__main__":
    create_invoice_image()
