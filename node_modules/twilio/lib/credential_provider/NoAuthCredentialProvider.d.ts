import CredentialProvider from "twilio/lib/credential_provider/CredentialProvider";
import AuthStrategy from "twilio/lib/auth_strategy/AuthStrategy";
declare namespace NoAuthCredentialProvider {
    class NoAuthCredentialProvider extends CredentialProvider {
        constructor();
        toAuthStrategy(): AuthStrategy;
    }
}
export = NoAuthCredentialProvider;
