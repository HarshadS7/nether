const Workspace = require('../model/Workspace');
const Repository = require('../model/Repository');

/**
 * Create a new workspace and track its repositories
 */
exports.createWorkspace = async (req, res) => {
    try {
        const { name, description, repositories, owner } = req.body;

        if (!name || !owner) {
            return res.status(400).json({
                success: false,
                message: 'Workspace name and owner are required'
            });
        }

        // Process repositories to ensure they are tracked in the database
        // We intentionally don't await all of them to fail the workspace creation
        // if one repository happens to be invalid, but we want to store them in the Workspace object.
        const validRepositories = Array.isArray(repositories) ? repositories : [];

        for (const repoUrl of validRepositories) {
            // Create a basic repository entry if it doesn't exist
            try {
                let repo = await Repository.findOne({ repoUrl: repoUrl });
                if (!repo) {
                    const nameParts = repoUrl.split('/');
                    const repoName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : repoUrl;

                    repo = new Repository({
                        repoUrl: repoUrl,
                        metadata: {
                            repoName: repoName,
                            owner: 'system', // or parse from URL
                        }
                    });
                    repo.addCommit(owner, 'initial'); // track that this owner added it
                    await repo.save();
                } else {
                    // Just ensure the owner has access tracked
                    repo.addCommit(owner, 'initial');
                    await repo.save();
                }
            } catch (repoErr) {
                console.warn(`Could not setup repository track for ${repoUrl} during workspace creation:`, repoErr.message);
            }
        }

        const newWorkspace = new Workspace({
            name,
            description,
            owner,
            repositories: validRepositories
        });

        await newWorkspace.save();

        res.status(201).json({
            success: true,
            message: 'Workspace created successfully',
            data: newWorkspace
        });

    } catch (error) {
        console.error('Error creating workspace:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating workspace',
            error: error.message
        });
    }
};

/**
 * Get all workspaces for a user
 */
exports.getWorkspaces = async (req, res) => {
    try {
        const owner = req.query.owner; // Expect owner as query param for now, could be via auth middleware later

        if (!owner) {
            return res.status(400).json({
                success: false,
                message: 'Owner parameter is required'
            });
        }

        const workspaces = await Workspace.find({ owner }).sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            data: workspaces
        });

    } catch (error) {
        console.error('Error fetching workspaces:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching workspaces',
            error: error.message
        });
    }
};

/**
 * Get a specific workspace and its repository details
 */
exports.getWorkspaceById = async (req, res) => {
    try {
        const workspaceId = req.params.id;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
            return res.status(404).json({
                success: false,
                message: 'Workspace not found'
            });
        }

        // Fetch details for all repositories in the workspace
        const repoDetails = await Repository.find({
            repoUrl: { $in: workspace.repositories }
        });

        res.status(200).json({
            success: true,
            data: {
                workspace,
                repositories: repoDetails
            }
        });

    } catch (error) {
        console.error('Error fetching workspace:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching workspace',
            error: error.message
        });
    }
};
