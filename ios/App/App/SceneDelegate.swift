import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = FrungzViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Frungz en vrai plein écran, en paysage. La barre d'état et la barre d'accueil sont masquées par SystemBars
/// (capacitor.config.json, « hidden »). La WebView couvre tout l'écran (le jeu garde ses marges avec env(safe-area-inset-*)),
/// fond noir, sans rebond ni loupe, et un balayage depuis un bord ne quitte pas l'app au premier geste.
class FrungzViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        webView?.isOpaque = true
        webView?.backgroundColor = .black
        webView?.scrollView.backgroundColor = .black
        webView?.scrollView.bounces = false
        webView?.scrollView.isScrollEnabled = false
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        // plusieurs doigts à la fois (joystick + visée + tir) sans zoom ni sélection
        webView?.isMultipleTouchEnabled = true
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView?.isInspectable = true }
        #endif
    }
}
