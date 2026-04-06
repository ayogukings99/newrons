/**
 * StorefrontScreen — v1
 *
 * "Node as shop" — every sovereign node has a persistent storefront profile.
 * This is the public-facing marketplace identity of a user's DID node,
 * displaying their products/services, trust score, reviews, and contact actions.
 *
 * Architecture:
 *   - Part of the unified neurons.app mobile app (Sovereign OS)
 *   - Storefront is one of the new Sovereign OS systems (see CLAUDE.md)
 *   - Shares DID identity with EconomyScreen / social layer
 *   - Prices denominated in NXT (community coin)
 *   - Dark theme: #0a0a0f bg, #111827 cards, #2dd4bf teal, #4279FF blue
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  FlatList,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Product {
  id: string
  title: string
  priceNxt: number
  gradientStart: string
  gradientEnd: string
  category: string
  inStock: boolean
}

interface Review {
  id: string
  reviewer: string
  avatarInitials: string
  avatarColor: string
  rating: number
  comment: string
  date: string
}

interface StorefrontProfile {
  shopName: string
  ownerName: string
  did: string
  isOnline: boolean
  rating: number
  reviewCount: number
  memberSince: string
  productsListed: number
  completedSales: number
  trustScore: number
  tagline: string
  location: string
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_PROFILE: StorefrontProfile = {
  shopName: 'Kelechi Tech Hub',
  ownerName: 'Kelechi A.',
  did: 'did:scn:5J7q3K9mP2L8vX4nR6sT7yZ9aB1cD3eF5gH7j',
  isOnline: true,
  rating: 4.8,
  reviewCount: 127,
  memberSince: 'Jan 2024',
  productsListed: 18,
  completedSales: 94,
  trustScore: 97,
  tagline: 'Repairs · Design · Produce · Tutorials',
  location: 'Lagos, NG',
}

const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    title: 'Phone Repair',
    priceNxt: 120,
    gradientStart: '#4279FF',
    gradientEnd: '#7B4FFF',
    category: 'Tech Service',
    inStock: true,
  },
  {
    id: '2',
    title: 'Graphic Design',
    priceNxt: 80,
    gradientStart: '#2dd4bf',
    gradientEnd: '#0891b2',
    category: 'Creative',
    inStock: true,
  },
  {
    id: '3',
    title: 'Fresh Produce Bundle',
    priceNxt: 45,
    gradientStart: '#22c55e',
    gradientEnd: '#16a34a',
    category: 'Food & Agri',
    inStock: true,
  },
  {
    id: '4',
    title: 'Tech Tutorial',
    priceNxt: 30,
    gradientStart: '#f59e0b',
    gradientEnd: '#d97706',
    category: 'Education',
    inStock: true,
  },
]

const MOCK_REVIEWS: Review[] = [
  {
    id: '1',
    reviewer: 'Amara O.',
    avatarInitials: 'AO',
    avatarColor: '#4279FF',
    rating: 5,
    comment:
      'Fixed my screen in under 2 hours. Super professional, and the NXT payment went through instantly. Will definitely return.',
    date: '2 days ago',
  },
  {
    id: '2',
    reviewer: 'Tunde B.',
    avatarInitials: 'TB',
    avatarColor: '#2dd4bf',
    rating: 5,
    comment:
      'The logo design exceeded all expectations. Kelechi understood the brief perfectly. Highly recommend this node.',
    date: '1 week ago',
  },
  {
    id: '3',
    reviewer: 'Ngozi F.',
    avatarInitials: 'NF',
    avatarColor: '#7B4FFF',
    rating: 4,
    comment:
      'Produce bundle was fresh and well-packed. Slight delay on delivery but communication was great throughout.',
    date: '2 weeks ago',
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  const fullStars = Math.floor(rating)
  const hasHalf = rating - fullStars >= 0.5

  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map(i => {
        const iconName =
          i <= fullStars ? 'star' : i === fullStars + 1 && hasHalf ? 'star-half' : 'star-outline'
        return (
          <Ionicons
            key={i}
            name={iconName as any}
            size={size}
            color="#f59e0b"
            style={{ marginRight: 1 }}
          />
        )
      })}
    </View>
  )
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
})

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function StorefrontScreen() {
  const [cartCount, setCartCount] = useState(0)

  const profile = MOCK_PROFILE

  const handleAddToCart = (product: Product) => {
    setCartCount(prev => prev + 1)
    Alert.alert('Added to Cart', `${product.title} — ${product.priceNxt} NXT`)
  }

  const handleMessageSeller = () => {
    Alert.alert('Message Seller', `Opening chat with ${profile.ownerName}…`)
  }

  const handleShareStorefront = () => {
    Alert.alert('Share Storefront', `Sharing ${profile.shopName}\n${profile.did}`)
  }

  const handleCopyDID = () => {
    Alert.alert('DID Copied', profile.did)
  }

  const renderProductCard = ({ item, index }: { item: Product; index: number }) => {
    const isLeftColumn = index % 2 === 0
    return (
      <View style={[styles.productCard, isLeftColumn ? styles.productCardLeft : styles.productCardRight]}>
        {/* Image placeholder — coloured gradient box */}
        <View
          style={[
            styles.productImage,
            { backgroundColor: item.gradientStart },
          ]}
        >
          {/* Diagonal gradient effect using two overlapping views */}
          <View
            style={[
              styles.productImageOverlay,
              { backgroundColor: item.gradientEnd },
            ]}
          />
          <Ionicons
            name={
              item.category === 'Tech Service'
                ? 'build-outline'
                : item.category === 'Creative'
                ? 'brush-outline'
                : item.category === 'Food & Agri'
                ? 'leaf-outline'
                : 'school-outline'
            }
            size={32}
            color="rgba(255,255,255,0.9)"
          />
        </View>

        {/* Card body */}
        <View style={styles.productBody}>
          <Text style={styles.productCategory}>{item.category}</Text>
          <Text style={styles.productTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.productPriceRow}>
            <Text style={styles.productPrice}>{item.priceNxt}</Text>
            <Text style={styles.productCurrency}> NXT</Text>
          </View>

          <TouchableOpacity
            style={[styles.addToCartBtn, { borderColor: item.gradientStart }]}
            onPress={() => handleAddToCart(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={13} color={item.gradientStart} />
            <Text style={[styles.addToCartText, { color: item.gradientStart }]}>
              Add to Cart
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.outerContainer}>
      {/* Fixed cart badge in top-right corner */}
      {cartCount > 0 && (
        <TouchableOpacity style={styles.cartFab} onPress={() => Alert.alert('Cart', `${cartCount} item(s) in cart`)}>
          <Ionicons name="cart" size={20} color="#fff" />
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* ---------------------------------------------------------------- */}
        {/* 1. HEADER — Shop banner with gradient overlay                    */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.bannerContainer}>
          {/* Gradient banner — simulated with layered views */}
          <View style={styles.bannerBase} />
          <View style={styles.bannerGradientLayer} />
          <View style={styles.bannerGradientLayerRight} />

          {/* Overlay content */}
          <View style={styles.bannerContent}>
            {/* Shop avatar circle */}
            <View style={styles.shopAvatarRing}>
              <View style={styles.shopAvatar}>
                <Text style={styles.shopAvatarText}>KT</Text>
              </View>
            </View>

            {/* Shop info */}
            <View style={styles.shopInfo}>
              <View style={styles.shopNameRow}>
                <Text style={styles.shopName}>{profile.shopName}</Text>
                {/* Verified badge */}
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#2dd4bf" />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              </View>

              <Text style={styles.shopTagline}>{profile.tagline}</Text>

              {/* DID badge */}
              <TouchableOpacity style={styles.didBadge} onPress={handleCopyDID}>
                <Ionicons name="finger-print-outline" size={11} color="#9ca3af" />
                <Text style={styles.didBadgeText}>
                  {profile.did.substring(0, 22)}…
                </Text>
              </TouchableOpacity>

              {/* Status row */}
              <View style={styles.statusRow}>
                {/* Online status */}
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online now</Text>

                {/* Separator */}
                <Text style={styles.statusSeparator}>·</Text>

                {/* Location */}
                <Ionicons name="location-outline" size={12} color="#9ca3af" />
                <Text style={styles.locationText}>{profile.location}</Text>

                {/* Separator */}
                <Text style={styles.statusSeparator}>·</Text>

                {/* Member since */}
                <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                <Text style={styles.memberSinceText}>Since {profile.memberSince}</Text>
              </View>

              {/* Rating */}
              <View style={styles.ratingRow}>
                <StarRating rating={profile.rating} size={15} />
                <Text style={styles.ratingValue}>{profile.rating}</Text>
                <Text style={styles.reviewCount}>({profile.reviewCount} reviews)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* 2. STATS ROW — 3 metric cards                                    */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="cube-outline" size={18} color="#4279FF" />
            <Text style={styles.statNumber}>{profile.productsListed}</Text>
            <Text style={styles.statLabel}>Products{'\n'}Listed</Text>
          </View>

          <View style={[styles.statCard, styles.statCardMiddle]}>
            <Ionicons name="checkmark-done-outline" size={18} color="#2dd4bf" />
            <Text style={[styles.statNumber, { color: '#2dd4bf' }]}>{profile.completedSales}</Text>
            <Text style={styles.statLabel}>Completed{'\n'}Sales</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#22c55e" />
            <Text style={[styles.statNumber, { color: '#22c55e' }]}>{profile.trustScore}%</Text>
            <Text style={styles.statLabel}>Trust{'\n'}Score</Text>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* 3. PRODUCTS / SERVICES GRID                                      */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Services & Products</Text>
            <TouchableOpacity>
              <Text style={styles.sectionAction}>See all</Text>
            </TouchableOpacity>
          </View>

          {/* 2-column FlatList */}
          <FlatList
            data={MOCK_PRODUCTS}
            renderItem={renderProductCard}
            keyExtractor={item => item.id}
            numColumns={2}
            scrollEnabled={false}
            columnWrapperStyle={styles.productRow}
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* 4. REVIEWS SECTION                                               */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            <View style={styles.sectionTitleBadge}>
              <StarRating rating={profile.rating} size={12} />
              <Text style={styles.sectionTitleBadgeText}>{profile.rating} · {profile.reviewCount}</Text>
            </View>
          </View>

          <View style={styles.reviewsList}>
            {MOCK_REVIEWS.map(review => (
              <View key={review.id} style={styles.reviewCard}>
                {/* Reviewer header */}
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewAvatar, { backgroundColor: review.avatarColor }]}>
                    <Text style={styles.reviewAvatarText}>{review.avatarInitials}</Text>
                  </View>
                  <View style={styles.reviewMeta}>
                    <Text style={styles.reviewerName}>{review.reviewer}</Text>
                    <View style={styles.reviewRatingRow}>
                      <StarRating rating={review.rating} size={12} />
                      <Text style={styles.reviewDate}>{review.date}</Text>
                    </View>
                  </View>
                  <Ionicons name="checkmark-circle" size={16} color="#2dd4bf" />
                </View>
                {/* Review comment */}
                <Text style={styles.reviewComment}>{review.comment}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* 5. CONTACT / ACTION BUTTONS                                      */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.primaryActionBtn}
            onPress={handleMessageSeller}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0a0a0f" />
            <Text style={styles.primaryActionText}>Message Seller</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineActionBtn}
            onPress={handleShareStorefront}
            activeOpacity={0.85}
          >
            <Ionicons name="share-social-outline" size={18} color="#2dd4bf" />
            <Text style={styles.outlineActionText}>Share Storefront</Text>
          </TouchableOpacity>
        </View>

        {/* Footer spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },

  // ------ Cart FAB ------
  cartFab: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 100,
    backgroundColor: '#4279FF',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4279FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  cartBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // ------ Banner / Header ------
  bannerContainer: {
    height: 220,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1040',
  },
  bannerGradientLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#4279FF',
    opacity: 0.55,
    // Skewed left-to-right effect
    left: 0,
    right: '50%',
  },
  bannerGradientLayerRight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#7B4FFF',
    opacity: 0.45,
    left: '30%',
  },
  bannerContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
    paddingTop: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  shopAvatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    flexShrink: 0,
  },
  shopAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopAvatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
  shopInfo: {
    flex: 1,
    gap: 5,
  },
  shopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  shopName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(45,212,191,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.3)',
  },
  verifiedText: {
    color: '#2dd4bf',
    fontSize: 10,
    fontWeight: '700',
  },
  shopTagline: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '500',
  },
  didBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  didBadgeText: {
    color: '#9ca3af',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  onlineText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '600',
  },
  statusSeparator: {
    color: '#4b5563',
    fontSize: 12,
  },
  locationText: {
    color: '#9ca3af',
    fontSize: 11,
  },
  memberSinceText: {
    color: '#9ca3af',
    fontSize: 11,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingValue: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewCount: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },

  // ------ Stats Row ------
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  statCardMiddle: {
    borderColor: 'rgba(45,212,191,0.2)',
  },
  statNumber: {
    color: '#4279FF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 15,
  },

  // ------ Section shared ------
  section: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#e5e7eb',
    fontSize: 17,
    fontWeight: '700',
  },
  sectionAction: {
    color: '#2dd4bf',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionTitleBadgeText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },

  // ------ Products Grid ------
  productRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  productCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2937',
    width: '48.5%',
  },
  productCardLeft: {
    marginRight: 0,
  },
  productCardRight: {
    marginLeft: 0,
  },
  productImage: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  productImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
    left: '40%',
    transform: [{ skewX: '-20deg' }],
  },
  productBody: {
    padding: 10,
    gap: 4,
  },
  productCategory: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productTitle: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minHeight: 36,
  },
  productPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  productPrice: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  productCurrency: {
    color: '#2dd4bf',
    fontSize: 12,
    fontWeight: '700',
  },
  addToCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  addToCartText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ------ Reviews ------
  reviewsList: {
    gap: 10,
  },
  reviewCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 10,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  reviewAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  reviewMeta: {
    flex: 1,
    gap: 3,
  },
  reviewerName: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
  },
  reviewRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewDate: {
    color: '#6b7280',
    fontSize: 11,
  },
  reviewComment: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 20,
  },

  // ------ Contact / Action buttons ------
  actionsSection: {
    marginHorizontal: 16,
    marginTop: 28,
    gap: 12,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#2dd4bf',
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: '#2dd4bf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryActionText: {
    color: '#0a0a0f',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  outlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1.5,
    borderColor: '#2dd4bf',
    borderRadius: 14,
    paddingVertical: 15,
    backgroundColor: 'transparent',
  },
  outlineActionText: {
    color: '#2dd4bf',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
