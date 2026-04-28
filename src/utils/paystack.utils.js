import https from "https";

/**
 * paystackRequest
 * Generic helper for Paystack API calls.
 */
const paystackRequest = (method, path, body = null) => {
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
 *
 * @param {object} params - { businessName, bankCode, accountNumber, description }
 * @returns {object} Paystack subaccount data including subaccount_code
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
 * Use to populate the bank dropdown in the vendor registration form.
 */
export const getBankList = async () => {
  const response = await paystackRequest("GET", "/bank?currency=NGN&country=nigeria");
  return response.data;
};

/**
 * resolveAccountNumber
 * Verifies a bank account and returns the account holder's name.
 * Call this before creating a subaccount to validate vendor bank details.
 *
 * @param {string} accountNumber - 10-digit bank account number
 * @param {string} bankCode      - Paystack bank code e.g. "058"
 * @returns {object} { account_number, account_name }
 */
export const resolveAccountNumber = async (accountNumber, bankCode) => {
  const response = await paystackRequest(
    "GET",
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
  );
  return response.data;
};

/**
 * initializeTransaction
 * Starts a new payment session.
 * 
 * @param {object} params - { email, amount (in kobo), metadata, subaccount, transaction_charge, callback_url }
 */
export const initializeTransaction = async ({ email, amount, metadata, subaccount, transaction_charge, callback_url, return_url }) => {
  const body = {
    email,
    amount,
    metadata,
    ...(callback_url && { callback_url }),
    ...(return_url && { return_url }),
    ...(subaccount && { subaccount, transaction_charge }),
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