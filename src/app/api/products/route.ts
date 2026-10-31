import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: { variants: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, products });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, basePrice, costPrice, variants } = body;

    if (!name || basePrice === undefined || costPrice === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, basePrice, costPrice)" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        basePrice: parseFloat(basePrice),
        costPrice: parseFloat(costPrice),
        variants: variants && Array.isArray(variants) ? {
          create: variants.map((v: any) => ({
            name: v.name,
            priceAdjustment: parseFloat(v.priceAdjustment || 0),
          })),
        } : undefined,
      },
      include: { variants: true },
    });

    return NextResponse.json({
      success: true,
      message: `Product '${product.name}' created with ${product.variants.length} variant(s).`,
      product,
    });
  } catch (error: any) {
    console.error("Create product error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create product" },
      { status: 500 }
    );
  }
}
