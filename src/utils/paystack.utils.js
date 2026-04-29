import https from "https";

/**
 * paystackRequest
 * Generic helper for Paystack API calls.
 */
const paystackRequest = (method, path, body = null) => {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return Promise.reject(new Error("PAYSTACK_SECRET_KEY is not configured"));
  }

  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: "api.paystack.co",
      path,
      method,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...(payload && { "Content-Length": Buffer.byteLength(payload) }),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === false) {
            reject(new Error(parsed.message || "Paystack API error"));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error("Failed to parse Paystack response"));
        }
      });
    });

    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
};

/**
 * createSubaccount
 * Creates a Paystack subaccount for a new vendor.
 * This subaccount holds the vendor's funds during escrow.
 */
export const createSubaccount = async ({ businessName, bankCode, accountNumber, description }) => {
  const response = await paystackRequest("POST", "/subaccount", {
    business_name: businessName,
    settlement_bank: bankCode,
    account_number: accountNumber,
    percentage_charge: 0,
    description: description || `Chequemart vendor: ${businessName}`,
  });
  return response.data;
};

/**
 * getBankList
 * Returns all Nigerian banks supported by Paystack.
 */
export const getBankList = async () => {
  const response = await paystackRequest("GET", "/bank?currency=NGN&country=nigeria");
  return response.data;
};

/**
 * resolveAccountNumber
 * Verifies a bank account and returns the account holder's name.
 * Call this before creating a subaccount to validate vendor bank details.
 */
export const resolveAccountNumber = async (accountNumber, bankCode, accountType = "personal") => {
  let params = `account_number=${accountNumber}&bank_code=${bankCode}`;
  if (accountType) {
    params += `&account_type=${accountType}`;
  }
  const response = await paystackRequest(
    "GET",
    `/bank/resolve?${params}`
  );
  return response.data;
};

/**
 * initializeTransaction
 * Starts a new payment session.
 */
export const initializeTransaction = async ({ email, amount, metadata, subaccount, transaction_charge, callback_url, return_url, split_code }) => {
  const body = {
    email,
    amount,
    metadata,
    ...(callback_url && { callback_url }),
    ...(return_url && { return_url }),
    ...(split_code && { split_code }),
    ...(subaccount && !split_code && { subaccount, transaction_charge }),
  };

  const response = await paystackRequest("POST", "/transaction/initialize", body);
  return response.data;
};

/**
 * verifyTransaction
 * Checks the status of a transaction using its reference.
 */
export const verifyTransaction = async (reference) => {
  const response = await paystackRequest("GET", `/transaction/verify/${reference}`);
  return response.data;
};

/**
 * createTransfer
 * Initiates a transfer to a recipient's bank account.
 * Used for seller withdrawals.
 */
export const createTransfer = async ({ amount, recipient, reference }) => {
  const body = {
    amount,
    recipient,
    reference,
    currency: "NGN"
  };

  const response = await paystackRequest("POST", "/transfer", body);
  return response.data;
};

/**
 * createRecipient
 * Creates a transfer recipient for a bank account.
 */
export const createRecipient = async ({ type, name, account_number, bank_code }) => {
  const body = {
    type,
    name,
    account_number,
    bank_code
  };

  const response = await paystackRequest("POST", "/transferrecipient", body);
  return response.data;
};

/**
 * getTransfer
 * Gets details of a transfer by ID or reference.
 */
export const getTransfer = async (idOrReference) => {
  const response = await paystackRequest("GET", `/transfer/${idOrReference}`);
  return response.data;
};

/**
 * createBulkSplit
 * Creates a dynamic split configuration for multi-vendor payments.
 */
export const createBulkSplit = async ({ name, subaccounts }) => {
  const body = {
    name,
    type: "percentage",
    subaccounts
  };

  const response = await paystackRequest("POST", "/split", body);
  return response.data;
};

/**
 * listSplits
 * Lists all available split configurations.
 */
export const listSplits = async () => {
  const response = await paystackRequest("GET", "/split");
  return response.data;
};