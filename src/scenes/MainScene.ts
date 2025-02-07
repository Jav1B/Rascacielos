import 'phaser';

interface BlockConfig {
    width: number;
    height: number;
    color: number;
    speed: number;
}

interface SavedGameState {
    highScore: number;
}

export class MainScene extends Phaser.Scene {
    private currentBlock?: Phaser.GameObjects.Rectangle;
    private stackedBlocks: Phaser.GameObjects.Rectangle[] = [];
    private blockShadows: Phaser.GameObjects.Rectangle[] = [];
    private gameContainer?: Phaser.GameObjects.Container;
    private uiContainer?: Phaser.GameObjects.Container;
    private score: number = 0;
    private highScore: number = 0;
    private scoreText?: Phaser.GameObjects.Text;
    private highScoreText?: Phaser.GameObjects.Text;
    private levelText?: Phaser.GameObjects.Text;
    private gameOver: boolean = false;
    private isPaused: boolean = false;
    private pauseText?: Phaser.GameObjects.Text;
    private moveSpeed: number = 2;
    private gameWidth: number;
    private gameHeight: number;
    private level: number = 1;
    private viewportOffset: number = 200; // Distance from top block to viewport top
    private worldHeight: number = 0;
    private gridLines: Phaser.GameObjects.Graphics[] = [];
    private placementGuide?: Phaser.GameObjects.Line;
    private readonly GRID_SIZE = 50;
    private readonly GRID_COLOR = 0x444444;
    private baseY: number;
    private readonly BLOCK_BASE_HEIGHT = 50;
    private readonly VIEW_OFFSET = 400; // Distance from top of stack to top of view
    private readonly SHADOW_OFFSET = 4;
    private readonly SHADOW_ALPHA = 0.3;
    private readonly COLORS = {
        standard: 0x4CAF50,  // Green
        wide: 0x2196F3,     // Blue
        narrow: 0xFF4081,    // Pink
        fast: 0xFFC107      // Amber
    };
    private perfectStreak: number = 0;
    private multiplierText?: Phaser.GameObjects.Text;
    private readonly MAX_MULTIPLIER = 5;
    private blockContainer?: Phaser.GameObjects.Container;
    private cityBackground?: Phaser.GameObjects.Graphics;
    private readonly CITY_COLORS = [
        0x1a237e, // Dark blue
        0x311b92, // Deep purple
        0x004d40, // Teal
        0x1b5e20  // Green
    ];
    private uiScale: number = 1;
    private readonly MIN_UI_SCALE = 0.8;
    private readonly MAX_UI_SCALE = 1.2;
    private touchActive: boolean = false;
    private tutorialText?: Phaser.GameObjects.Text;
    private currentVelocity: number = 0;
    private readonly BLOCK_ACCELERATION = 0.2;
    private readonly MAX_BLOCK_SPEED = 8;
    private readonly BLOCK_SNAP_THRESHOLD = 10;
    private readonly BLOCK_BOUNCE_ELASTICITY = 0.8;
    private lastFrameTime: number = 0;
    private readonly MIN_BLOCKS_BEFORE_SCROLL = 5;
    private readonly CAMERA_OFFSET_RATIO = 0.6; // How much of the viewport height to keep above the stack
    private readonly GROUND_OFFSET = 100; // Space between ground and bottom of screen
    private readonly MIN_BLOCKS_FOR_CAMERA = 8; // Number of blocks before camera starts following
    private readonly CAMERA_MOVE_DURATION = 500; // ms for camera movement
    
    private readonly blockTypes: BlockConfig[] = [
        { width: 100, height: 50, color: this.COLORS.standard, speed: 2 },
        { width: 150, height: 50, color: this.COLORS.wide, speed: 2.5 },
        { width: 80, height: 50, color: this.COLORS.narrow, speed: 3 },
        { width: 100, height: 50, color: this.COLORS.fast, speed: 3.5 }
    ];

    constructor() {
        super({ key: 'MainScene' });
        this.gameWidth = 800;
        this.gameHeight = 600;
        this.baseY = this.gameHeight;
    }

    init() {
        // Reset all game state
        this.score = 0;
        this.level = 1;
        this.gameOver = false;
        this.isPaused = false;
        this.stackedBlocks = [];
        this.blockShadows = [];
        this.moveSpeed = 2;
        
        // Load high score from local storage
        try {
            const savedState = localStorage.getItem('cityBloxxState');
            if (savedState) {
                const state: SavedGameState = JSON.parse(savedState);
                this.highScore = state.highScore;
            }
        } catch (e) {
            console.warn('Could not load saved game state');
        }

        // Reset camera position
        if (this.cameras.main) {
            this.cameras.main.setScroll(0, 0);
        }
    }

    preload() {
        // Load sound effects (commented out until we have the files)
        /*
        this.load.audio('place', 'assets/sounds/place.mp3');
        this.load.audio('perfect', 'assets/sounds/perfect.mp3');
        this.load.audio('levelup', 'assets/sounds/levelup.mp3');
        this.load.audio('gameover', 'assets/sounds/gameover.mp3');
        this.load.audio('bgm', 'assets/sounds/background.mp3');
        */

        // Create a white pixel texture for particles
        const graphics = this.add.graphics();
        graphics.fillStyle(0xffffff);
        graphics.fillRect(0, 0, 2, 2);
        graphics.generateTexture('pixel', 2, 2);
        graphics.destroy();
    }

    create() {
        this.gameWidth = this.sys.game.canvas.width;
        this.gameHeight = this.sys.game.canvas.height;
        this.baseY = this.gameHeight - this.GROUND_OFFSET;
        
        // Set up camera bounds
        this.cameras.main.setBounds(0, -10000, this.gameWidth, 10000 + this.gameHeight);
        this.cameras.main.setBackgroundColor('#333333');

        // Calculate UI scale based on screen size
        this.uiScale = Math.min(
            this.MAX_UI_SCALE,
            Math.max(
                this.MIN_UI_SCALE,
                Math.min(this.gameWidth / 800, this.gameHeight / 600)
            )
        );

        // Create background elements
        this.createCityBackground();
        this.createGrid();
        
        // Create UI with proper scaling
        this.createUI();
        
        // Create tutorial text
        this.createTutorial();
        
        // Set up input handlers
        this.setupInputHandlers();
        
        // Create first block at base level
        this.createNewBlock();
    }

    private createCityBackground() {
        this.cityBackground = this.add.graphics();
        
        // Create darker gradient for sky
        const skyGradient = this.add.graphics();
        for (let y = 0; y < this.gameHeight; y++) {
            const alpha = 1 - (y / this.gameHeight) * 0.5;
            skyGradient.lineStyle(1, 0x000000, alpha);
            skyGradient.lineBetween(0, y, this.gameWidth, y);
        }
        
        // Create city silhouettes
        for (let i = 0; i < 20; i++) {
            const height = Phaser.Math.Between(100, 300);
            const width = Phaser.Math.Between(40, 80);
            const x = i * 60 + Phaser.Math.Between(-20, 20);
            const y = this.gameHeight - height;
            const color = this.CITY_COLORS[i % this.CITY_COLORS.length];
            
            // Building shadow
            this.cityBackground
                .fillStyle(0x000000, 0.3)
                .fillRect(x + 5, y + 5, width, height);
            
            // Main building
            this.cityBackground
                .fillStyle(color)
                .fillRect(x, y, width, height);

            // Windows
            const windowSize = 6;
            const windowSpacing = 15;
            for (let wy = y + 20; wy < this.gameHeight - 20; wy += windowSpacing) {
                for (let wx = x + 10; wx < x + width - 10; wx += windowSpacing) {
                    if (Math.random() > 0.3) {
                        this.cityBackground
                            .fillStyle(0xffeb3b, 0.3)
                            .fillRect(wx, wy, windowSize, windowSize);
                    }
                }
            }
        }

        // Create vignette effect using shapes
        const vignette = this.add.graphics();
        
        // Left side vignette
        for (let x = 0; x < 100; x++) {
            const alpha = (100 - x) / 100 * 0.5;
            vignette.lineStyle(1, 0x000000, alpha);
            vignette.lineBetween(x, 0, x, this.gameHeight);
        }
        
        // Right side vignette
        for (let x = 0; x < 100; x++) {
            const alpha = x / 100 * 0.5;
            vignette.lineStyle(1, 0x000000, alpha);
            vignette.lineBetween(this.gameWidth - x, 0, this.gameWidth - x, this.gameHeight);
        }

        // Set scroll factors for parallax
        this.cityBackground.setScrollFactor(0.3);
        skyGradient.setScrollFactor(0.1);
        vignette.setScrollFactor(0);
    }

    private createGrid() {
        const graphics = this.add.graphics();
        graphics.lineStyle(1, this.GRID_COLOR, 0.2);

        // Create vertical lines
        for (let x = 0; x <= this.gameWidth; x += this.GRID_SIZE) {
            graphics.lineBetween(x, -10000, x, 10000);
        }

        // Create horizontal lines
        for (let y = -10000; y <= 10000; y += this.GRID_SIZE) {
            graphics.lineBetween(0, y, this.gameWidth, y);
        }

        // Create scanlines effect
        const scanlines = this.add.graphics();
        for (let y = 0; y < this.gameHeight; y += 4) {
            scanlines.lineStyle(1, 0x000000, 0.1);
            scanlines.lineBetween(0, y, this.gameWidth, y);
        }
        scanlines.setScrollFactor(0);
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        this.gameWidth = gameSize.width;
        this.gameHeight = gameSize.height;
        
        if (this.pauseText) {
            this.pauseText.setPosition(gameSize.width / 2, gameSize.height / 2);
        }
    }

    private togglePause() {
        this.isPaused = !this.isPaused;
        if (this.pauseText) {
            this.pauseText.setVisible(this.isPaused);
        }
    }

    update(time: number, delta: number) {
        if (this.gameOver || !this.currentBlock || this.isPaused) return;

        // Calculate elapsed time since last frame for smooth movement
        const deltaTime = this.lastFrameTime ? (time - this.lastFrameTime) / 16.667 : 1;
        this.lastFrameTime = time;

        // Update current velocity with acceleration
        this.currentVelocity += this.moveSpeed * this.BLOCK_ACCELERATION * deltaTime;
        
        // Clamp velocity
        this.currentVelocity = Phaser.Math.Clamp(
            this.currentVelocity,
            -this.MAX_BLOCK_SPEED,
            this.MAX_BLOCK_SPEED
        );

        // Move block with interpolated velocity
        this.currentBlock.x += this.currentVelocity * deltaTime;
        
        // Bounce off screen edges with elasticity
        const config = this.getCurrentBlockConfig();
        const margin = config.width / 2;
        if (this.currentBlock.x >= this.gameWidth - margin) {
            this.currentBlock.x = this.gameWidth - margin;
            this.currentVelocity *= -this.BLOCK_BOUNCE_ELASTICITY;
            this.moveSpeed *= -1;
        } else if (this.currentBlock.x <= margin) {
            this.currentBlock.x = margin;
            this.currentVelocity *= -this.BLOCK_BOUNCE_ELASTICITY;
            this.moveSpeed *= -1;
        }

        // Update placement guide with interpolation
        if (this.placementGuide && this.stackedBlocks.length > 0) {
            const lastBlock = this.stackedBlocks[this.stackedBlocks.length - 1];
            const distance = Math.abs(lastBlock.x - this.currentBlock.x);
            const maxDistance = config.width * 0.5;
            const progress = 1 - (distance / maxDistance);
            
            // Add snapping effect when close to perfect alignment
            if (distance < this.BLOCK_SNAP_THRESHOLD) {
                const snapStrength = 1 - (distance / this.BLOCK_SNAP_THRESHOLD);
                this.currentBlock.x = Phaser.Math.Linear(
                    this.currentBlock.x,
                    lastBlock.x,
                    snapStrength * 0.1 * deltaTime
                );
            }

            const color = this.getColorForProgress(progress);
            this.placementGuide
                .setTo(this.currentBlock.x, 0, this.currentBlock.x, this.gameHeight)
                .setStrokeStyle(2, color, 0.5)
                .setVisible(true);
        }

        // Update shadow position with smooth follow
        const shadow = this.blockShadows[this.blockShadows.length - 1];
        if (shadow) {
            shadow.x = Phaser.Math.Linear(
                shadow.x,
                this.currentBlock.x + this.SHADOW_OFFSET,
                0.5
            );
        }

        // Update block glow position
        const glow = this.currentBlock.getData('glow');
        if (glow) {
            glow.x = this.currentBlock.x;
            glow.y = this.currentBlock.y;
        }
    }

    private getColorForProgress(progress: number): number {
        if (progress > 0.9) return 0x00ff00; // Perfect alignment - green
        if (progress > 0.6) return 0xffff00; // Good alignment - yellow
        return 0xff0000; // Poor alignment - red
    }

    private getCurrentBlockConfig(): BlockConfig {
        const index = Math.min(
            Math.floor((this.level - 1) / 3) % this.blockTypes.length,
            this.blockTypes.length - 1
        );
        const baseConfig = this.blockTypes[index];
        
        // Increase speed with level
        const speedIncrease = Math.min((this.level - 1) * 0.1, 2);
        return {
            ...baseConfig,
            speed: baseConfig.speed + speedIncrease
        };
    }

    private createBlockGlow(block: Phaser.GameObjects.Rectangle, color: number) {
        const glow = this.add.graphics();
        const glowSize = 20;
        const x = block.x - block.width/2 - glowSize/2;
        const y = block.y - block.height/2 - glowSize/2;
        const width = block.width + glowSize;
        const height = block.height + glowSize;

        // Create multiple layers of glow with decreasing alpha
        for (let i = glowSize; i > 0; i -= 2) {
            glow.lineStyle(i, color, (glowSize - i) / glowSize * 0.2);
            glow.strokeRect(x + i/2, y + i/2, width - i, height - i);
        }

        return glow;
    }

    private createNewBlock() {
        const config = this.getCurrentBlockConfig();
        
        // Calculate block position relative to the ground or previous block
        let y = this.baseY;
        if (this.stackedBlocks.length > 0) {
            const lastBlock = this.stackedBlocks[this.stackedBlocks.length - 1];
            y = lastBlock.y - this.BLOCK_BASE_HEIGHT;
        }

        // Random X position that doesn't overlap with screen edges
        const margin = config.width / 2;
        const randomX = Phaser.Math.Between(
            margin,
            this.gameWidth - margin
        );

        // Create shadow and block
        const shadow = this.add.rectangle(
            randomX + this.SHADOW_OFFSET,
            y + this.SHADOW_OFFSET,
            config.width,
            config.height,
            0x000000
        ).setAlpha(this.SHADOW_ALPHA);

        this.currentBlock = this.add.rectangle(
            randomX,
            y,
            config.width,
            config.height,
            this.COLORS[this.getBlockType(config)]
        );

        // Store shadow reference
        this.blockShadows.push(shadow);

        // Only start camera movement after enough blocks
        if (this.stackedBlocks.length >= this.MIN_BLOCKS_FOR_CAMERA) {
            // Calculate how much of the stack should be visible
            const visibleStackHeight = (this.stackedBlocks.length + 1) * this.BLOCK_BASE_HEIGHT;
            const shouldScroll = visibleStackHeight > this.gameHeight * 0.6;

            if (shouldScroll) {
                // Calculate target camera position to show current block at top
                const targetY = Math.max(
                    0,
                    y - (this.gameHeight * 0.3) // Keep block in upper third of screen
                );

                // Smooth camera pan
                this.cameras.main.pan(
                    this.gameWidth / 2,
                    targetY,
                    this.CAMERA_MOVE_DURATION,
                    'Cubic.easeInOut',
                    true,
                    (camera: Phaser.Cameras.Scene2D.Camera, progress: number) => {
                        // Only show placement guide after camera movement
                        if (this.placementGuide) {
                            this.placementGuide.setVisible(progress === 1);
                        }
                    }
                );
            }
        }

        // Random initial direction and speed
        this.moveSpeed = config.speed * (Math.random() < 0.5 ? 1 : -1);

        // Add glow effect for current block
        const glow = this.createBlockGlow(
            this.currentBlock,
            this.COLORS[this.getBlockType(config)]
        );
        
        // Animate glow
        this.tweens.add({
            targets: glow,
            alpha: { from: 0.8, to: 0.2 },
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.currentBlock.setData('glow', glow);

        // Add glow effect and pulsing animation
        this.currentBlock.setStrokeStyle(2, 0xffffff, 0.3);
        this.tweens.add({
            targets: this.currentBlock,
            scaleX: { from: 0.9, to: 1.1 },
            scaleY: { from: 0.9, to: 1.1 },
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private getBlockType(config: BlockConfig): keyof typeof this.COLORS {
        if (config.width > 100) return 'wide';
        if (config.width < 100) return 'narrow';
        if (config.speed > 2.5) return 'fast';
        return 'standard';
    }

    private updateHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            if (this.highScoreText) {
                this.highScoreText.setText(`High Score: ${this.highScore}`);
            }
            try {
                localStorage.setItem('cityBloxxState', JSON.stringify({
                    highScore: this.highScore
                }));
            } catch (e) {
                console.warn('Could not save game state');
            }
        }
    }

    private async placeBlock() {
        if (this.gameOver || !this.currentBlock || this.isPaused) return;

        // Remove tutorial if it exists
        if (this.tutorialText) {
            this.tweens.add({
                targets: this.tutorialText,
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    this.tutorialText?.destroy();
                    this.tutorialText = undefined;
                }
            });
        }

        const config = this.getCurrentBlockConfig();
        
        // Check alignment with previous block
        if (this.stackedBlocks.length > 0) {
            const prevBlock = this.stackedBlocks[this.stackedBlocks.length - 1];
            const distance = Math.abs(prevBlock.x - this.currentBlock.x);

            if (distance > config.width * 0.5) {
                this.handleGameOver();
                return;
            }

            // Handle perfect placement
            if (distance < 5) {
                this.handlePerfectPlacement();
            }
        }

        // Add block to stack
        this.stackedBlocks.push(this.currentBlock);
        
        // Ensure the camera has completed its movement before creating new block
        if (this.stackedBlocks.length >= this.MIN_BLOCKS_FOR_CAMERA) {
            await new Promise(resolve => {
                this.time.delayedCall(50, resolve); // Small delay for smooth transition
            });
        }

        // Create next block
        this.createNewBlock();
    }

    private createImpactEffect(x: number, y: number) {
        // Create impact circles
        const impact = this.add.graphics();
        impact.lineStyle(2, 0xffffff, 0.8);
        
        // Animate expanding circles
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(i * 100, () => {
                const circle = new Phaser.Geom.Circle(x, y, 0);
                this.tweens.add({
                    targets: circle,
                    radius: 50,
                    duration: 500,
                    ease: 'Quad.out',
                    onUpdate: () => {
                        impact.clear();
                        impact.strokeCircleShape(circle);
                    },
                    onComplete: () => {
                        if (i === 2) impact.destroy();
                    }
                });
            });
        }
    }

    private handleGameOver() {
        this.gameOver = true;
        
        // Fade out all blocks
        this.tweens.add({
            targets: [...this.stackedBlocks, ...this.blockShadows],
            alpha: 0.5,
            duration: 500,
            ease: 'Cubic.easeOut'
        });

        // Create game over container for centered layout
        const gameOverContainer = this.add.container(
            this.gameWidth / 2,
            this.cameras.main.scrollY + this.gameHeight / 2
        );

        // Background panel
        const panel = this.add.rectangle(
            0,
            0,
            300,
            200,
            0x000000,
            0.8
        );
        panel.setStrokeStyle(2, 0xffffff);

        // Game over text
        const gameOverText = this.add.text(
            0,
            -60,
            'GAME OVER',
            {
                fontSize: '36px',
                color: '#ff0000',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // Score texts
        const scoreText = this.add.text(
            0,
            -10,
            `Score: ${this.score}`,
            {
                fontSize: '24px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        const highScoreText = this.add.text(
            0,
            20,
            `High Score: ${this.highScore}`,
            {
                fontSize: '24px',
                color: '#ffff00'
            }
        ).setOrigin(0.5);

        // Restart button with hover effect
        const restartButton = this.add.rectangle(0, 60, 160, 40, 0x4CAF50)
            .setInteractive()
            .on('pointerover', () => restartButton.setFillStyle(0x66BB6A))
            .on('pointerout', () => restartButton.setFillStyle(0x4CAF50));

        const restartText = this.add.text(
            0,
            60,
            'Play Again',
            {
                fontSize: '20px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        // Add everything to container
        gameOverContainer.add([panel, gameOverText, scoreText, highScoreText, restartButton, restartText]);
        gameOverContainer.setDepth(100).setScrollFactor(0);

        // Handle restart
        restartButton.on('pointerdown', () => {
            this.tweens.add({
                targets: gameOverContainer,
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    gameOverContainer.destroy();
                    this.scene.restart();
                }
            });
        });
    }

    private handlePerfectPlacement() {
        this.perfectStreak++;
        const multiplier = Math.min(this.perfectStreak, this.MAX_MULTIPLIER);
        const bonusPoints = 50 * multiplier;
        this.score += bonusPoints;
        
        // Update and show multiplier text
        if (this.multiplierText) {
            this.multiplierText.setText(`${multiplier}x PERFECT!`)
                .setVisible(true);
            
            // Animate multiplier text
            this.tweens.add({
                targets: this.multiplierText,
                scaleX: { from: 1.5, to: 1 },
                scaleY: { from: 1.5, to: 1 },
                duration: 200,
                ease: 'Back.easeOut'
            });
        }

        // Create sparkle effect
        const particles = this.add.particles(0, 0, 'pixel', {
            lifespan: 1000,
            speed: { min: 100, max: 200 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 1, end: 0 },
            blendMode: 'ADD',
            gravityY: 200,
            quantity: 20,
            emitting: false
        });

        particles.setPosition(this.currentBlock!.x, this.currentBlock!.y);
        particles.explode(20);

        // Add floating score text
        const bonusText = this.add.text(
            this.currentBlock!.x,
            this.currentBlock!.y - 40,
            `+${bonusPoints}`,
            { 
                fontSize: '28px',
                color: '#ffff00',
                stroke: '#000000',
                strokeThickness: 4,
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // Animate bonus text
        this.tweens.add({
            targets: bonusText,
            y: bonusText.y - 60,
            alpha: 0,
            duration: 1000,
            ease: 'Cubic.out',
            onComplete: () => bonusText.destroy()
        });
    }

    private updateScore() {
        this.score += 10;
        if (this.scoreText) {
            this.scoreText.setText(`Score: ${this.score}`);
        }

        this.updateHighScore();

        // Level up every 5 blocks
        if (this.stackedBlocks.length % 5 === 0) {
            this.level++;
            if (this.levelText) {
                this.levelText.setText(`Level: ${this.level}`);
                this.tweens.add({
                    targets: this.levelText,
                    scaleX: 1.5,
                    scaleY: 1.5,
                    duration: 200,
                    yoyo: true
                });
            }
        }
    }

    private createUI() {
        // Score display with drop shadow
        this.scoreText = this.add.text(16, 16, 'Score: 0', {
            fontSize: `${32 * this.uiScale}px`,
            color: '#fff',
            shadow: { color: '#000', fill: true, blur: 8, offsetX: 2, offsetY: 2 }
        })
        .setScrollFactor(0)
        .setDepth(100);

        this.highScoreText = this.add.text(16, 96 * this.uiScale, `High Score: ${this.highScore}`, {
            fontSize: `${24 * this.uiScale}px`,
            color: '#ffff00',
            shadow: { color: '#000', fill: true, blur: 8, offsetX: 2, offsetY: 2 }
        })
        .setScrollFactor(0)
        .setDepth(100);

        this.levelText = this.add.text(16, 56 * this.uiScale, 'Level: 1', {
            fontSize: `${24 * this.uiScale}px`,
            color: '#fff',
            shadow: { color: '#000', fill: true, blur: 8, offsetX: 2, offsetY: 2 }
        })
        .setScrollFactor(0)
        .setDepth(100);

        // Multiplier text with glow effect
        this.multiplierText = this.add.text(this.gameWidth - 16, 16, '', {
            fontSize: `${24 * this.uiScale}px`,
            color: '#ffff00',
            shadow: { color: '#000', fill: true, blur: 8, offsetX: 2, offsetY: 2 }
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(100)
        .setVisible(false);

        // Pause button with better touch area
        const pauseButton = this.add.container(this.gameWidth - 60 * this.uiScale, 60 * this.uiScale);
        
        const pauseCircle = this.add.circle(0, 0, 30 * this.uiScale, 0x000000, 0.6);
        const pauseText = this.add.text(0, 0, '⏸️', {
            fontSize: `${24 * this.uiScale}px`,
            color: '#fff'
        }).setOrigin(0.5);
        
        pauseButton.add([pauseCircle, pauseText]);
        pauseButton.setDepth(100).setScrollFactor(0);
        
        pauseCircle.setInteractive({ useHandCursor: true })
            .on('pointerover', () => pauseCircle.setFillStyle(0x333333, 0.8))
            .on('pointerout', () => pauseCircle.setFillStyle(0x000000, 0.6))
            .on('pointerdown', () => this.togglePause());
    }

    private createTutorial() {
        if (this.stackedBlocks.length === 0) {
            const isMobile = this.sys.game.device.input.touch;
            const action = isMobile ? 'Tap' : 'Click or Press Space';
            
            this.tutorialText = this.add.text(
                this.gameWidth / 2,
                this.gameHeight * 0.4,
                `${action} to place the block!\nBuild the tallest tower you can!`,
                {
                    fontSize: `${28 * this.uiScale}px`,
                    color: '#fff',
                    align: 'center',
                    shadow: { color: '#000', fill: true, blur: 8, offsetX: 2, offsetY: 2 }
                }
            )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(100)
            .setAlpha(0);

            // Fade in tutorial
            this.tweens.add({
                targets: this.tutorialText,
                alpha: 1,
                duration: 1000,
                ease: 'Cubic.easeOut'
            });
        }
    }

    private setupInputHandlers() {
        // Touch and mouse input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.isPaused || this.gameOver) return;
            
            // Ignore input if it's on the pause button area
            if (pointer.y < 100 * this.uiScale && pointer.x > this.gameWidth - 100 * this.uiScale) {
                return;
            }

            this.touchActive = true;
            this.placeBlock();
        });

        this.input.on('pointerup', () => {
            this.touchActive = false;
        });

        // Keyboard input
        if (this.input.keyboard) {
            this.input.keyboard.on('keydown-SPACE', () => {
                if (!this.isPaused && !this.gameOver) {
                    this.placeBlock();
                }
            });
            this.input.keyboard.on('keydown-P', () => this.togglePause());
            this.input.keyboard.on('keydown-R', () => {
                if (this.gameOver) {
                    this.scene.restart();
                }
            });
        }
    }
}