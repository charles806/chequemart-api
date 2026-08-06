import Domain from "twilio/lib/base/Domain";
import V1 from "twilio/lib/rest/iam/V1";
declare class IamBase extends Domain {
    _v1?: V1;
    /**
     * Initialize iam domain
     *
     * @param twilio - The twilio client
     */
    constructor(twilio: any);
    get v1(): V1;
}
export = IamBase;
