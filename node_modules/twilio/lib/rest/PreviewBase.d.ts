import Domain from "twilio/lib/base/Domain";
import HostedNumbers from "twilio/lib/rest/preview/HostedNumbers";
import Marketplace from "twilio/lib/rest/preview/Marketplace";
import Wireless from "twilio/lib/rest/preview/Wireless";
declare class PreviewBase extends Domain {
    _hosted_numbers?: HostedNumbers;
    _marketplace?: Marketplace;
    _wireless?: Wireless;
    /**
     * Initialize preview domain
     *
     * @param twilio - The twilio client
     */
    constructor(twilio: any);
    get hosted_numbers(): HostedNumbers;
    get marketplace(): Marketplace;
    get wireless(): Wireless;
}
export = PreviewBase;
