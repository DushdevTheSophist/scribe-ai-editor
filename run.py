import sys
import subprocess
import os

def check_and_install_dependencies():
    """Checks for required Python packages and installs them if missing."""
    required_packages = ['fastapi', 'uvicorn', 'sqlalchemy']
    missing_packages = []
    
    for pkg in required_packages:
        try:
            __import__(pkg)
        except ImportError:
            missing_packages.append(pkg)
            
    if missing_packages:
        print(f"Missing required packages: {', '.join(missing_packages)}")
        print("Installing dependencies from backend/requirements.txt...")
        
        req_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend', 'requirements.txt')
        if not os.path.exists(req_file):
            print(f"Error: requirements.txt not found at {req_file}")
            sys.exit(1)
            
        try:
            # Run pip install
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", req_file])
            print("Successfully installed all dependencies!")
        except subprocess.CalledProcessError as e:
            print(f"Failed to install dependencies: {e}")
            sys.exit(1)
    else:
        print("All dependencies are satisfied.")

def main():
    print("=" * 60)
    print(" ScribeAI - Smart Markdown Editor & Co-Writer Launcher")
    print("=" * 60)
    
    # 1. Dependency Check
    check_and_install_dependencies()
    
        # 2. Inform user about API configuration
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        print("\n[+] GEMINI_API_KEY detected. AI features enabled!")
    else:
        print("\n[!] No GEMINI_API_KEY detected in environment.")
        print("    Running with local rule-based and NLP fallback algorithms.")
        print("    To unlock full AI power, set the variable in your terminal:")
        print("      Windows PowerShell:  $env:GEMINI_API_KEY=\"your_key\"")
        print("      Windows CMD:         set GEMINI_API_KEY=your_key")
        print("      macOS/Linux:         export GEMINI_API_KEY=\"your_key\"")

    print("\nStarting the server...")
    print("Access the editor at: http://127.0.0.1:8000")
    print("Access the API docs at: http://127.0.0.1:8000/docs")
    print("-" * 60)
    
    # 3. Start Uvicorn Server
    import uvicorn
    # We specify "backend.main:app" as a string to allow reload option to function
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()
