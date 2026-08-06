import * as Sentry from '@sentry/node';

export const monitorFinancialOp = (operation, { amount, userId, reference, metadata = {} }) => {
  Sentry.addBreadcrumb({
    category: 'financial',
    message: `${operation}: ${amount || 'N/A'}`,
    data: { amount, userId, reference, ...metadata },
    level: 'info',
  });
};

export const captureFinancialError = (error, { operation, amount, userId, reference }) => {
  Sentry.withScope((scope) => {
    scope.setTag('financial_op', operation);
    scope.setTag('amount', String(amount || ''));
    if (userId) scope.setUser({ id: userId });
    scope.setExtra('reference', reference);
    Sentry.captureException(error);
  });
};
