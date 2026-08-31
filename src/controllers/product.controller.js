import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import User from '../models/User.model.js';

const recalcSellerRating = async (sellerId) => {
  const products = await Product.find({ seller: sellerId }).select('averageRating');
  const rated = products.filter((p) => p.averageRating > 0);
  if (rated.length === 0) return;
  const avg = rated.reduce((sum, p) => sum + p.averageRating, 0) / rated.length;
  await User.findByIdAndUpdate(sellerId, { 'sellerInfo.rating': Math.round(avg * 10) / 10 });
};

/* To any future dev working on this project this message is from
 the first dev on this project yes this is long and inefficint but 
 it does it best to works do not refactor unless needed thank you */

export const getAllProducts = async (req, res) => {
  try {
    const {
      category,
      seller,
      search,
      page = 1,
      limit = 20,
      sort = '-createdAt',
      minPrice,
      maxPrice,
      condition,
    } = req.query;

    const filter = { isActive: true };

    if (category) {
      filter.category = category;
    }

    if (seller) {
      filter.seller = seller;
    }

    if (condition) {
      filter.condition = condition;
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    if (req.query.rating) {
      filter.averageRating = { $gte: Number(req.query.rating) };
    }

    // Handle sorting
    let sortQuery = {};
    switch (sort) {
      case 'price_asc':
        sortQuery = { price: 1 };
        break;
      case 'price_desc':
        sortQuery = { price: -1 };
        break;
      case 'name':
        sortQuery = { name: 1 };
        break;
      case 'rating':
        sortQuery = { averageRating: -1 };
        break;
      case 'popular':
        sortQuery = { totalReviews: -1, averageRating: -1 };
        break;
      case 'newest':
      default:
        sortQuery = { createdAt: -1 };
    }

    const products = await Product.find(filter)
      .populate('seller', 'name email')
      .sort(sortQuery)
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Product.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Products retrieved successfully',
      data: products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving products',
      error: error.message,
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
      });
    }

    const product = await Product.findById(id).populate('seller', 'name email avatar');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product retrieved successfully',
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving product',
      error: error.message,
    });
  }
};

export const getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true, isFeatured: true })
      .populate('seller', 'name email')
      .limit(10);

    res.status(200).json({
      success: true,
      message: 'Featured products retrieved successfully',
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving featured products',
      error: error.message,
    });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      discountPrice,
      category,
      images,
      condition,
      stock,
      sku,
      specifications,
      isFeatured,
      deliveryFee,
    } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, and category are required',
      });
    }

    // Auto-generate SKU if missing
    const finalSku =
      sku && sku.trim() !== ''
        ? sku
        : `CHK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const product = await Product.create({
      name,
      description,
      price,
      discountPrice: discountPrice > 0 ? discountPrice : undefined,
      category,
      images: images || [],
      condition,
      stock: stock || 0,
      sku: finalSku,
      seller: req.user._id,
      specifications: specifications || {},
      isFeatured: isFeatured || false,
      deliveryFee: deliveryFee > 0 ? deliveryFee : 0,
    });

    await product.populate('seller', 'name email');

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message,
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    if (req.user.role !== 'admin' && product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own products',
      });
    }

    const allowedFields = [
      'name',
      'description',
      'price',
      'discountPrice',
      'category',
      'images',
      'condition',
      'stock',
      'sku',
      'specifications',
      'isFeatured',
      'isActive',
      'deliveryFee',
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Generate SKU only if SKU was explicitly sent as empty
    if ('sku' in req.body && (!req.body.sku || req.body.sku.trim() === '')) {
      updates.sku = `CHK-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      },
    ).populate('seller', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct,
    });
  } catch (error) {
    console.error('UPDATE PRODUCT ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message,
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    if (req.user.role !== 'admin' && product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own products',
      });
    }

    await Product.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message,
    });
  }
};

export const getMyProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const products = await Product.find({ seller: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Product.countDocuments({ seller: req.user._id });

    res.status(200).json({
      success: true,
      message: 'My products retrieved successfully',
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving products',
      error: error.message,
    });
  }
};

export const rateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const userId = req.user._id;

    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Check if user already rated
    const existingRatingIndex = product.ratings.findIndex(
      (r) => r.user.toString() === userId.toString(),
    );

    const newRating = {
      user: userId,
      rating,
      review: review || '',
      createdAt: new Date(),
    };

    if (existingRatingIndex > -1) {
      // Update existing rating
      product.ratings[existingRatingIndex] = newRating;
    } else {
      // Add new rating
      product.ratings.push(newRating);
    }

    await product.save();

    // Update seller's aggregate rating
    await recalcSellerRating(product.seller);

    res.status(200).json({
      success: true,
      message:
        existingRatingIndex > -1 ? 'Rating updated successfully' : 'Rating added successfully',
      data: {
        averageRating: product.averageRating,
        totalReviews: product.totalReviews,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding rating',
      error: error.message,
    });
  }
};

export const getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
      });
    }

    const product = await Product.findById(id).populate('ratings.user', 'name');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Sort by newest first
    const reviews = product.ratings
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((r) => ({
        user: r.user?.name,
        rating: r.rating,
        review: r.review,
        createdAt: r.createdAt,
      }));

    res.status(200).json({
      success: true,
      data: {
        reviews,
        averageRating: product.averageRating,
        totalReviews: product.totalReviews,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving reviews',
      error: error.message,
    });
  }
};
