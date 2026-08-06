/**
 * validateTransition - Helper to ensure order status transitions follow business rules
 * 
 * Flow: 
 * PENDING -> [PROCESSING, CANCELLED]
 * PROCESSING -> [CONFIRMED, CANCELLED]
 * CONFIRMED -> [SHIPPED, CANCELLED]
 * SHIPPED -> [DELIVERED]
 * DELIVERED -> [COLLECTED]
 * 
 * Role Permissions:
 * - Admin: CONFIRMED
 * - Seller: PROCESSING, SHIPPED, COLLECTED
 * - Buyer: CANCELLED, DELIVERED
 */

export const ALLOWED_TRANSITIONS = {
  pending: {
    next: ['processing', 'cancelled'],
    roles: {
      processing: ['system', 'admin', 'seller'], // System usually handles this via payment webhook
      cancelled: ['buyer', 'admin', 'seller']
    }
  },
  processing: {
    next: ['confirmed', 'cancelled'],
    roles: {
      confirmed: ['admin', 'seller'],
      cancelled: ['admin', 'seller']
    }
  },
  confirmed: {
    next: ['shipped', 'cancelled'],
    roles: {
      shipped: ['seller'],
      cancelled: ['admin', 'seller']
    }
  },
  shipped: {
    next: ['delivered'],
    roles: {
      delivered: ['seller', 'admin']
    }
  },
  delivered: {
    next: ['collected'],
    roles: {
      collected: ['buyer', 'system']
    }
  },
  collected: {
    next: [],
    roles: {}
  },
  cancelled: {
    next: [],
    roles: {}
  }
};

export const validateTransition = (currentStatus, targetStatus, userRole) => {
  const transition = ALLOWED_TRANSITIONS[currentStatus.toLowerCase()];
  
  if (!transition) {
    return { valid: false, message: `Invalid current status: ${currentStatus}` };
  }

  if (!transition.next.includes(targetStatus.toLowerCase())) {
    return { 
      valid: false, 
      message: `Cannot transition from ${currentStatus} to ${targetStatus}. Allowed: ${transition.next.join(', ')}` 
    };
  }

  const allowedRoles = transition.roles[targetStatus.toLowerCase()] || [];
  if (userRole !== 'system' && !allowedRoles.includes(userRole)) {
    return { 
      valid: false, 
      message: `Role '${userRole}' is not authorized to move order to '${targetStatus}'` 
    };
  }

  return { valid: true };
};
