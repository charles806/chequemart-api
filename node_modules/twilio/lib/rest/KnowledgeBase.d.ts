import Domain from "twilio/lib/base/Domain";
import V1 from "twilio/lib/rest/knowledge/V1";
declare class KnowledgeBase extends Domain {
    _v1?: V1;
    /**
     * Initialize knowledge domain
     *
     * @param twilio - The twilio client
     */
    constructor(twilio: any);
    get v1(): V1;
}
export = KnowledgeBase;
